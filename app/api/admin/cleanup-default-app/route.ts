import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Rota de uso único pra remover o "App Padrão" (App Meta compartilhado,
// criado automaticamente pra quem conectava sem ter o próprio) de todo
// mundo que o recebeu. O recurso em si já foi removido do código — isso só
// limpa o que já tinha sido criado no banco antes da remoção. Protegida
// pelo mesmo secret dos crons; chamada manualmente e depois apagada.
function authorized(request: Request) {
  const secret = process.env.QUEUE_CRON_SECRET?.trim()
  if (!secret) return false
  const authorization = request.headers.get("authorization")?.trim()
  return authorization === `Bearer ${secret}`
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1"

  const defaultAppId = process.env.INSTAGRAM_DEFAULT_APP_ID?.trim()

  const apps = await prisma.instagramApp.findMany({
    where: {
      OR: [
        { name: "App Padrão" },
        ...(defaultAppId ? [{ metaAppId: defaultAppId }] : []),
      ],
    },
    select: {
      id: true,
      userId: true,
      name: true,
      metaAppId: true,
      _count: { select: { accounts: true } },
    },
  })

  const affectedAccounts = apps.reduce((sum, app) => sum + app._count.accounts, 0)

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      appsFound: apps.length,
      accountsAffected: affectedAccounts,
      apps,
    })
  }

  const result = await prisma.instagramApp.deleteMany({
    where: { id: { in: apps.map((app) => app.id) } },
  })

  return NextResponse.json({
    dryRun: false,
    appsDeleted: result.count,
    accountsAffected: affectedAccounts,
  })
}
