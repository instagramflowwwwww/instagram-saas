import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { isAdminEmail } from "@/lib/account-access"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { INSTAGRAM_GRAPH_VERSION } from "@/lib/instagram-meta"

export const dynamic = "force-dynamic"

// Precisa bater com ACCOUNT_CONCURRENCY (lib/instagram-publisher.ts) e
// ACCOUNT_CHUNK_SIZE (lib/queue-processor.ts) — não dá pra importar direto
// (são consts internas, não exportadas), isso aqui é só pra exibição.
const QUEUE_CONCURRENCY = 550

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const databaseUrl = process.env.DATABASE_URL || ""
  const poolerMode = databaseUrl.includes("pgbouncer=true")
    ? "Transaction (PgBouncer)"
    : databaseUrl.includes("-pooler")
      ? "Pooler sem pgbouncer=true"
      : "Conexão direta"

  let postgres: {
    connected: boolean
    latencyMs: number | null
    tableCount: number | null
  } = { connected: false, latencyMs: null, tableCount: null }

  try {
    const start = Date.now()
    const tableCountResult = await prisma.$queryRaw<{ count: number }[]>`
      SELECT count(*)::int as count FROM information_schema.tables WHERE table_schema = 'public'
    `
    postgres = {
      connected: true,
      latencyMs: Date.now() - start,
      tableCount: tableCountResult[0]?.count ?? null,
    }
  } catch (error) {
    console.error("[system-health] Postgres check failed", error)
  }

  const storageConfigured = Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME
  )

  const [metaAppsConfigured, authenticatedAccounts] = await Promise.all([
    prisma.instagramApp.count().catch(() => 0),
    prisma.instagramAccount
      .count({
        where: {
          connectionType: "official",
          isActive: true,
          accessToken: { not: null },
          tokenExpiresAt: { gt: new Date() },
        },
      })
      .catch(() => 0),
  ])

  return NextResponse.json(
    {
      postgres: { ...postgres, poolerMode },
      backend: {
        region: process.env.VERCEL_REGION || "gru1",
        runtime: `Node.js ${process.version}`,
        domain: "instaflowapp.com.br",
      },
      storage: {
        configured: storageConfigured,
        bucket: process.env.R2_BUCKET_NAME || null,
        formats: ["MP4", "MOV", "JPEG"],
      },
      queue: {
        concurrency: QUEUE_CONCURRENCY,
        lockStrategy: 'UPDATE condicional ("status = pending") — só quem ganha a corrida processa',
      },
      meta: {
        graphVersion: INSTAGRAM_GRAPH_VERSION,
        appsConfigured: metaAppsConfigured,
        authenticatedAccounts,
        redirectPath: "/api/instagram/callback",
        tokenCycle: "Token de 60 dias, renovação automática a partir de 7 dias antes de expirar",
      },
    },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } }
  )
}
