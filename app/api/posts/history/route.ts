import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import type { Prisma } from "@prisma/client"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const BRAZIL_OFFSET = "-03:00"
const ALLOWED_STATUSES = new Set([
  "draft",
  "publishing",
  "published",
  "partial",
  "failed",
  "scheduled",
  "cancelled",
])

function activeAccountFilter(now = new Date()): Prisma.InstagramAccountWhereInput {
  return {
    connectionType: "official",
    isActive: true,
    accessToken: { not: null },
    appConfigId: { not: null },
    tokenExpiresAt: { gt: now },
  }
}

function parseDate(value: string | null, endOfDay = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const time = endOfDay ? "23:59:59.999" : "00:00:00.000"
  const date = new Date(`${value}T${time}${BRAZIL_OFFSET}`)
  return Number.isNaN(date.getTime()) ? null : date
}

function readPositiveInteger(value: string | null, fallback: number, max: number) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) return fallback
  return Math.min(parsed, max)
}

function buildBaseWhere(params: {
  userId: string
  from: Date | null
  to: Date | null
  type: string
  accountId: string
  search: string
}): Prisma.PostWhereInput {
  const where: Prisma.PostWhereInput = { userId: params.userId }

  if (params.from || params.to) {
    where.createdAt = {
      ...(params.from ? { gte: params.from } : {}),
      ...(params.to ? { lte: params.to } : {}),
    }
  }

  if (params.type === "image") {
    where.publicationType = "post"
    where.imageUrl = { not: null }
  }
  if (params.type === "reel") {
    where.publicationType = "post"
    where.videoUrl = { not: null }
  }
  if (params.type === "story") where.publicationType = "story"

  if (params.accountId) {
    where.logs = {
      some: {
        instagramAccountId: params.accountId,
        instagramAccount: activeAccountFilter(),
      },
    }
  }

  if (params.search) {
    where.OR = [
      { caption: { contains: params.search, mode: "insensitive" } },
      { hashtags: { contains: params.search, mode: "insensitive" } },
      {
        logs: {
          some: {
            instagramAccount: {
              ...activeAccountFilter(),
              username: {
                contains: params.search.replace(/^@/, ""),
                mode: "insensitive",
              },
            },
          },
        },
      },
      {
        logs: {
          some: {
            errorMessage: { contains: params.search, mode: "insensitive" },
            instagramAccount: activeAccountFilter(),
          },
        },
      },
    ]
  }

  return where
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }


  const { searchParams } = new URL(request.url)
  const page = readPositiveInteger(searchParams.get("page"), 1, 100_000)
  const limit = readPositiveInteger(searchParams.get("limit"), 20, 50)
  const status = String(searchParams.get("status") || "all").toLowerCase()
  const type = String(searchParams.get("type") || "all").toLowerCase()
  const accountId = String(searchParams.get("accountId") || "").trim()
  const search = String(searchParams.get("search") || "").trim().slice(0, 120)
  const from = parseDate(searchParams.get("from"))
  const to = parseDate(searchParams.get("to"), true)

  if (from && to && from.getTime() > to.getTime()) {
    return NextResponse.json({ error: "O período informado é inválido." }, { status: 400 })
  }
  if (!["all", "image", "reel", "story"].includes(type)) {
    return NextResponse.json({ error: "O tipo de conteúdo informado é inválido." }, { status: 400 })
  }
  if (status !== "all" && !ALLOWED_STATUSES.has(status)) {
    return NextResponse.json({ error: "O status informado é inválido." }, { status: 400 })
  }

  const baseWhere = buildBaseWhere({
    userId: session.user.id,
    from,
    to,
    type,
    accountId,
    search,
  })
  const filteredWhere: Prisma.PostWhereInput = {
    ...baseWhere,
    ...(status !== "all" ? { status } : {}),
  }
  const activeAccounts = activeAccountFilter()

  try {
    const [posts, total, groupedStatuses, accounts] = await Promise.all([
      prisma.post.findMany({
        where: filteredWhere,
        select: {
          id: true,
          caption: true,
          hashtags: true,
          imageUrl: true,
          videoUrl: true,
          publicationType: true,
          status: true,
          scheduledAt: true,
          publishedAt: true,
          createdAt: true,
          logs: {
            where: { instagramAccount: activeAccounts },
            select: {
              id: true,
              status: true,
              errorMessage: true,
              mediaId: true,
              createdAt: true,
              instagramAccount: {
                select: {
                  id: true,
                  username: true,
                  name: true,
                  profilePicture: true,
                  isActive: true,
                },
              },
            },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.post.count({ where: filteredWhere }),
      prisma.post.groupBy({
        by: ["status"],
        where: baseWhere,
        _count: { _all: true },
      }),
      prisma.instagramAccount.findMany({
        where: { userId: session.user.id, ...activeAccounts },
        select: {
          id: true,
          username: true,
          profilePicture: true,
          isActive: true,
        },
        orderBy: { username: "asc" },
      }),
    ])

    const summary = {
      total: 0,
      published: 0,
      partial: 0,
      failed: 0,
      scheduled: 0,
      publishing: 0,
      draft: 0,
      cancelled: 0,
    }

    groupedStatuses.forEach((item) => {
      const count = item._count._all
      summary.total += count
      if (item.status in summary) {
        summary[item.status as keyof Omit<typeof summary, "total">] = count
      }
    })

    return NextResponse.json({
      posts: posts.map((post) => {
        const successCount = post.logs.filter((log) => log.status === "success").length
        const errorCount = post.logs.filter((log) => log.status === "error").length

        return {
          ...post,
          type: post.publicationType === "story" ? "story" : post.videoUrl ? "reel" : "image",
          thumbnailUrl: post.imageUrl,
          successCount,
          errorCount,
          accountCount: new Set(post.logs.map((log) => log.instagramAccount.id)).size,
        }
      }),
      summary,
      accounts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      generatedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Post history error", error)
    return NextResponse.json(
      { error: "Não foi possível carregar o histórico de publicações." },
      { status: 500 }
    )
  }
}
