import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import {
  PerformanceLog,
  cachedResult,
  isCacheFresh,
  refreshPerformanceLogs,
} from "@/lib/instagram-performance"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

// Quantos posts vencidos, no máximo, atualizamos sozinhos ao abrir a tela —
// sempre os mais recentes primeiro (a lista já vem ordenada por data). Sem
// esse limite, abrir "Mês" ou "Tudo" com o cache vencido tentava atualizar
// cada post do período de uma vez, travando a tela por muito tempo. O botão
// "Atualizar dados" (force=1) continua atualizando tudo dentro do que a
// consulta já trouxe, sem esse limite.
const MAX_AUTO_REFRESH = 40
// Teto de posts retornados por carregamento. Sem isso, "Mês" ou "Tudo" com
// contas em grande volume (centenas) trazia milhares de linhas numa
// consulta só, mandava tudo pro navegador e a tela tentava renderizar cada
// uma de uma vez — travando a aba inteira. Sempre os mais recentes
// primeiro; "carregar mais" na tela busca o restante por trás.
const MAX_RESULTS = 300

function parseDate(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const SORT_FIELDS = {
  recent: { createdAt: "desc" as const },
  views: { performanceViewsCount: { sort: "desc" as const, nulls: "last" as const } },
  likes: { performanceLikeCount: { sort: "desc" as const, nulls: "last" as const } },
  comments: { performanceCommentsCount: { sort: "desc" as const, nulls: "last" as const } },
}

function parseSort(value: string | null): keyof typeof SORT_FIELDS {
  return value && value in SORT_FIELDS ? (value as keyof typeof SORT_FIELDS) : "recent"
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  try {
    const requestUrl = new URL(request.url)
    const rawFrom = requestUrl.searchParams.get("from")
    const rawTo = requestUrl.searchParams.get("to")
    const from = parseDate(rawFrom)
    const to = parseDate(rawTo)
    const shouldRefresh = requestUrl.searchParams.get("refresh") === "1"
    const forceRefresh = requestUrl.searchParams.get("force") === "1"
    const rawOffset = Number(requestUrl.searchParams.get("offset") || 0)
    const offset = Number.isInteger(rawOffset) && rawOffset > 0 ? rawOffset : 0
    const sort = parseSort(requestUrl.searchParams.get("sort"))
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

    if ((rawFrom && !from) || (rawTo && !to)) {
      return NextResponse.json(
        { error: "Período informado é inválido." },
        { status: 400 }
      )
    }

    if (from && to && from.getTime() >= to.getTime()) {
      return NextResponse.json(
        { error: "A data inicial precisa ser anterior à data final." },
        { status: 400 }
      )
    }

    const createdAt =
      from || to
        ? {
            ...(from ? { gte: from } : {}),
            ...(to ? { lt: to } : {}),
          }
        : undefined

    // Casa por @usuário gravado no próprio log (sobrevive à conta cair e ser
    // apagada) OU pelo id da conta — mesma lógica do resumo de pasta.
    const folderFilter =
      usernames?.length || accountIds?.length
        ? {
            OR: [
              ...(usernames?.length ? [{ username: { in: usernames } }] : []),
              ...(accountIds?.length ? [{ instagramAccountId: { in: accountIds } }] : []),
            ],
          }
        : {}

    const logs = (await prisma.postLog.findMany({
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
        id: true,
        mediaId: true,
        instagramAccountId: true,
        createdAt: true,
        performancePermalink: true,
        performanceLikeCount: true,
        performanceCommentsCount: true,
        performanceViewsCount: true,
        performanceViewsMetric: true,
        performanceMediaType: true,
        performanceMediaProductType: true,
        performancePublishedAt: true,
        performanceUpdatedAt: true,
        performanceError: true,
        post: {
          select: {
            caption: true,
          },
        },
        instagramAccount: {
          select: {
            id: true,
            username: true,
            profilePicture: true,
            accessToken: true,
            tokenExpiresAt: true,
          },
        },
      },
      // "id" no fim garante ordem estável entre páginas mesmo com muitos
      // empates no campo escolhido (ex.: vários posts com 0 visualizações).
      orderBy: [SORT_FIELDS[sort], { id: "desc" }],
      // Busca um a mais que o teto só pra saber se tem mais página depois,
      // sem precisar de uma segunda consulta de count.
      take: MAX_RESULTS + 1,
      skip: offset,
    })) as PerformanceLog[]

    const hasMore = logs.length > MAX_RESULTS
    const pageLogs = hasMore ? logs.slice(0, MAX_RESULTS) : logs

    const seen = new Set<string>()
    const uniqueLogs = pageLogs.filter((log) => {
      const key = `${log.instagramAccountId}:${log.mediaId}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    const now = Date.now()
    const paginationHeaders = {
      "Cache-Control": "private, no-store, max-age=0",
      "X-Has-More": hasMore ? "1" : "0",
    }

    if (!shouldRefresh) {
      return NextResponse.json(
        uniqueLogs.map((log) => cachedResult(log, now)),
        { headers: paginationHeaders }
      )
    }

    const logsToRefresh = forceRefresh
      ? uniqueLogs
      : uniqueLogs.filter((log) => !isCacheFresh(log, now)).slice(0, MAX_AUTO_REFRESH)

    if (logsToRefresh.length === 0) {
      return NextResponse.json(
        uniqueLogs.map((log) => cachedResult(log, now)),
        { headers: paginationHeaders }
      )
    }

    const refreshedResults = await refreshPerformanceLogs(logsToRefresh, now)

    const refreshedById = new Map(
      refreshedResults.map((result) => [result.id, result])
    )

    const activeAccountIds = new Set(
      (
        await prisma.instagramAccount.findMany({
          where: {
            id: { in: uniqueLogs.map((log) => log.instagramAccountId) },
            userId: session.user.id,
            connectionType: "official",
            isActive: true,
            accessToken: { not: null },
            appConfigId: { not: null },
            tokenExpiresAt: { gt: new Date() },
          },
          select: { id: true },
        })
      ).map((account) => account.id)
    )

    const response = uniqueLogs
      .filter((log) => activeAccountIds.has(log.instagramAccountId))
      .map((log) => refreshedById.get(log.id) || cachedResult(log, now))

    return NextResponse.json(response, { headers: paginationHeaders })
  } catch (error) {
    console.error("Instagram performance error", error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível carregar a performance.",
      },
      { status: 500 }
    )
  }
}
