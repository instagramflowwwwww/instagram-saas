import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"

export async function POST(request: Request) {
  const session = await getServerSession()
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { accountId, proxy } = await request.json()

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

  const account = await prisma.instagramAccount.findFirst({
    where: { id: accountId, userId: user.id },
  })
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 })

  await prisma.instagramAccount.update({
    where: { id: accountId },
    data: { proxy: proxy || null },
  })

  return NextResponse.json({ success: true })
}
