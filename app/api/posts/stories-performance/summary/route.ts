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

// Soma o que já está salvo (o valor mais recente que já pegamos de cada
// story) — não bate na Meta a cada carregamento da Performance. Para um
// story ainda no ar, esse número sobe sozinho quando a tela de Stories for
// aberta e atualizada; para um já expirado, é o último visto mesmo.
export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const requestUrl = new URL(request.url)
  const from = parseDate(requestUrl.searchParams.get("from"))
  const to = parseDate(requestUrl.searchParams.get("to"))

  const createdAt =
    from || to
      ? { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) }
      : undefined

  const logs = await prisma.postLog.findMany({
    where: {
      status: "success",
      mediaId: { not: null },
      ...(createdAt ? { createdAt } : {}),
      post: { userId: session.user.id, publicationType: "story" },
    },
    select: { performanceViewsCount: true },
  })

  const withData = logs.filter((log) => log.performanceViewsCount !== null)
  const totalViews = withData.reduce((sum, log) => sum + (log.performanceViewsCount || 0), 0)

  return NextResponse.json(
    {
      storiesCount: logs.length,
      storiesWithData: withData.length,
      totalViews,
    },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } }
  )
}
