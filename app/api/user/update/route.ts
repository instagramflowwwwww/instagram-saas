import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { isR2DeliveryUrl } from "@/lib/r2"

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const data: { name?: string; image?: string | null } = {}

  if (typeof body.name === "string") {
    data.name = body.name
  }

  if ("image" in body) {
    const image = body.image
    if (image === null) {
      data.image = null
    } else if (typeof image === "string" && isR2DeliveryUrl(image)) {
      data.image = image
    } else {
      return NextResponse.json({ error: "Foto de perfil inválida." }, { status: 400 })
    }
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data,
  })
  return NextResponse.json({ success: true })
}
