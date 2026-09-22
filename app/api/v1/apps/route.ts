import { NextResponse } from "next/server"
import { getApiUserId } from "@/lib/api-auth"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const userId = await getApiUserId(request)

  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const apps = await prisma.instagramApp.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      lastValidatedAt: true,
      createdAt: true,
      _count: { select: { accounts: true } },
    },
  })

  return NextResponse.json({
    apps: apps.map((app) => ({
      id: app.id,
      name: app.name || null,
      accountsCount: app._count.accounts,
      lastValidatedAt: app.lastValidatedAt,
      createdAt: app.createdAt,
    })),
  })
}
