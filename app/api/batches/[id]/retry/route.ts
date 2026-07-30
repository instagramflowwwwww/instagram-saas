import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { refreshBatchStats } from "@/lib/queue-processor"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"

export async function POST(
  _request: Request,
  context: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const batch = await prisma.postingBatch.findFirst({
    where: { id: context.params.id, userId: session.user.id },
    select: { id: true, status: true },
  })
  if (!batch) {
    return NextResponse.json({ error: "Automação não encontrada." }, { status: 404 })
  }

  const failedItems = await prisma.postingBatchItem.findMany({
    where: { batchId: batch.id, status: "failed" },
    select: { id: true, postId: true },
  })
  if (failedItems.length === 0) {
    return NextResponse.json(
      { error: "Não existem itens totalmente falhos para repetir." },
      { status: 409 }
    )
  }

  const postIds = failedItems.flatMap((item) => (item.postId ? [item.postId] : []))
  await prisma.$transaction([
    prisma.postingBatch.update({
      where: { id: batch.id },
      data: { status: "processing" },
    }),
    prisma.postingBatchItem.updateMany({
      where: { id: { in: failedItems.map((item) => item.id) } },
      data: {
        status: "pending",
        scheduledAt: new Date(),
        attempts: 0,
        lastError: null,
        processedAt: null,
        processingStartedAt: null,
      },
    }),
    ...(postIds.length > 0
      ? [
          prisma.post.updateMany({
            where: { id: { in: postIds } },
            data: { status: "scheduled", publishedAt: null },
          }),
        ]
      : []),
  ])

  await refreshBatchStats(batch.id)
  return NextResponse.json({ success: true, retried: failedItems.length })
}
