import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function parseDate(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

// Totais do período inteiro, direto do banco (sem o teto de 300 da listagem
// em /api/posts/performance) — assim o card de "visualizações totais" conta
// tudo mesmo sem o usuário precisar clicar em "Carregar mais" até o fim.
export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const requestUrl = new URL(request.url)
  const from = parseDate(requestUrl.searchParams.get("from"))
  const to = parseDate(requestUrl.searchParams.get("to"))
  const accountIds = requestUrl.searchParams
    .get("accountIds")
    ?.split(",")
    .map((id) => id.trim())
    .filter(Boolean)
  const usernames = requestUrl.searchParams
    .get("usernames")
    ?.split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)

  const createdAt =
    from || to
      ? { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) }
      : undefined

  // Casa por @usuário gravado no próprio log (sobrevive à conta cair e ser
  // apagada) OU pelo id da conta — mesma lógica do resumo de Stories.
  const folderFilter =
    usernames?.length || accountIds?.length
      ? {
          OR: [
            ...(usernames?.length ? [{ username: { in: usernames } }] : []),
            ...(accountIds?.length ? [{ instagramAccountId: { in: accountIds } }] : []),
          ],
        }
      : {}

  const logs = await prisma.postLog.findMany({
    where: {
      status: "success",
      mediaId: { not: null },
      ...(createdAt ? { createdAt } : {}),
      ...folderFilter,
      post: { userId: session.user.id, publicationType: "post" },
      instagramAccount: {
        connectionType: "official",
        isActive: true,
        accessToken: { not: null },
        appConfigId: { not: null },
        tokenExpiresAt: { gt: new Date() },
      },
    },
    select: {
      instagramAccountId: true,
      mediaId: true,
      performanceLikeCount: true,
      performanceCommentsCount: true,
      performanceViewsCount: true,
      performanceUpdatedAt: true,
      performanceError: true,
    },
  })

  const seen = new Set<string>()
  const uniqueLogs = logs.filter((log) => {
    const key = `${log.instagramAccountId}:${log.mediaId}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const totals = uniqueLogs.reduce(
    (summary, log) => ({
      likes: summary.likes + (log.performanceLikeCount || 0),
      comments: summary.comments + (log.performanceCommentsCount || 0),
      views: summary.views + (log.performanceViewsCount || 0),
    }),
    { likes: 0, comments: 0, views: 0 }
  )

  const postsWithData = uniqueLogs.filter(
    (log) => log.performanceUpdatedAt && !log.performanceError
  ).length

  return NextResponse.json(
    {
      postsCount: uniqueLogs.length,
      postsWithData,
      ...totals,
    },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } }
  )
}
