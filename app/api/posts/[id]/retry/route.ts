import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { publishExistingPost } from "@/lib/instagram-publisher"
import { refreshBatchStats } from "@/lib/queue-processor"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 280

// Repete só as contas que falharam numa publicação específica (usado no
// Histórico). Reaproveita a mesma função que a fila usa pra publicar de
// verdade — não é um "reagendar", tenta na hora.
export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const post = await prisma.post.findFirst({
    where: { id: params.id, userId: session.user.id },
    select: { id: true },
  })
  if (!post) {
    return NextResponse.json({ error: "Publicação não encontrada." }, { status: 404 })
  }

  const failedLogs = await prisma.postLog.findMany({
    where: { postId: post.id, status: "error" },
    select: { instagramAccountId: true },
  })
  const accountIds = Array.from(
    new Set(
      failedLogs
        .map((log) => log.instagramAccountId)
        .filter((id): id is string => Boolean(id))
    )
  )

  if (accountIds.length === 0) {
    return NextResponse.json(
      { error: "Não há contas com falha nesta publicação." },
      { status: 409 }
    )
  }

  try {
    const { results } = await publishExistingPost({
      postId: post.id,
      userId: session.user.id,
      accountIds,
    })

    // Se esse post veio de uma automação, mantém o item da fila em sincronia
    // com o resultado dessa tentativa manual — senão o Status da Fila ficaria
    // mostrando "falhou" mesmo depois de ter sido repetido por aqui.
    const batchItem = await prisma.postingBatchItem.findFirst({
      where: { postId: post.id },
      select: { id: true, batchId: true },
    })
    if (batchItem) {
      const stillFailing = results.some((result) => result.status === "error")
      await prisma.postingBatchItem.update({
        where: { id: batchItem.id },
        data: stillFailing
          ? {
              status: "pending",
              attempts: 0,
              scheduledAt: new Date(),
              processingStartedAt: null,
              processedAt: null,
              lastError:
                results.find((result) => result.status === "error")?.error || null,
            }
          : {
              status: "published",
              processedAt: new Date(),
              processingStartedAt: null,
              lastError: null,
            },
      })
      await refreshBatchStats(batchItem.batchId)
    }

    const successCount = results.filter((result) => result.status === "success").length

    return NextResponse.json({
      success: true,
      successCount,
      failedCount: results.length - successCount,
      results,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Não foi possível repetir a publicação.",
      },
      { status: 500 }
    )
  }
}
