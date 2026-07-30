import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { refreshBatchStats } from "@/lib/queue-processor"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"

export async function DELETE(
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
  if (["completed", "completed_with_errors", "cancelled"].includes(batch.status)) {
    return NextResponse.json(
      { error: "Esta automação já foi finalizada." },
      { status: 409 }
    )
  }

  const pendingItems = await prisma.postingBatchItem.findMany({
    where: { batchId: batch.id, status: "pending" },
    select: { id: true, postId: true },
  })
  const postIds = pendingItems.flatMap((item) => (item.postId ? [item.postId] : []))

  await prisma.$transaction([
    prisma.postingBatch.update({
      where: { id: batch.id },
      data: { status: "cancelled" },
    }),
    prisma.postingBatchItem.updateMany({
      where: { batchId: batch.id, status: "pending" },
      data: { status: "cancelled", processedAt: new Date() },
    }),
    ...(postIds.length > 0
      ? [
          prisma.post.updateMany({
            where: { id: { in: postIds } },
            data: { status: "cancelled" },
          }),
        ]
      : []),
  ])

  await refreshBatchStats(batch.id)
  return NextResponse.json({ success: true })
}
