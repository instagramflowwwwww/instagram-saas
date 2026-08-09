import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { isAdminEmail } from "@/lib/account-access"
import { authOptions } from "@/lib/auth"
import {
  clearInstagramProxyPool,
  getProxyPoolStats,
  importInstagramProxies,
} from "@/lib/proxy-manager"
import { clearInstagramProxyCache } from "@/lib/proxy-http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

function forbidden() {
  return NextResponse.json({ error: "Acesso negado." }, { status: 403 })
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!isAdminEmail(session?.user?.email)) return forbidden()

  const stats = await getProxyPoolStats()
  return NextResponse.json(stats, {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  })
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!isAdminEmail(session?.user?.email)) return forbidden()

  try {
    const body = await request.json()
    const result = await importInstagramProxies(body?.proxies)
    const stats = await getProxyPoolStats()

    return NextResponse.json({ success: true, ...result, stats })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível importar as proxies.",
      },
      { status: 400 }
    )
  }
}

export async function DELETE() {
  const session = await getServerSession(authOptions)
  if (!isAdminEmail(session?.user?.email)) return forbidden()

  try {
    const result = await clearInstagramProxyPool()
    clearInstagramProxyCache()
    const stats = await getProxyPoolStats()

    return NextResponse.json({ success: true, ...result, stats })
  } catch (error) {
    console.error("Failed to clear Instagram proxy pool", error)
    return NextResponse.json(
      { error: "Não foi possível limpar o pool de proxies." },
      { status: 500 }
    )
  }
}
