import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_FOLDER_NAME = 80

function normalizeFolderName(value: unknown) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_FOLDER_NAME)
}

async function getUserId() {
  const session = await getServerSession(authOptions)
  return session?.user?.id || null
}

async function duplicateFolderExists(userId: string, name: string, exceptId?: string) {
  const duplicate = await prisma.mediaFolder.findFirst({
    where: {
      userId,
      name: { equals: name, mode: "insensitive" },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  })
  return Boolean(duplicate)
}

export async function GET() {
  const userId = await getUserId()
  if (!userId) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const folders = await prisma.mediaFolder.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }],
    include: {
      _count: {
        select: { media: true },
      },
    },
  })

  return NextResponse.json(folders)
}

export async function POST(request: Request) {
  const userId = await getUserId()
  if (!userId) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const name = normalizeFolderName(body.name)

    if (!name) {
      return NextResponse.json({ error: "Digite um nome para a pasta." }, { status: 400 })
    }

    if (await duplicateFolderExists(userId, name)) {
      return NextResponse.json({ error: "Já existe uma pasta com esse nome." }, { status: 409 })
    }

    const folder = await prisma.mediaFolder.create({
      data: { userId, name },
      include: { _count: { select: { media: true } } },
    })

    return NextResponse.json(folder, { status: 201 })
  } catch (error) {
    console.error("Library folder create error", error)
    return NextResponse.json({ error: "Não foi possível criar a pasta." }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const userId = await getUserId()
  if (!userId) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const id = String(body.id || "").trim()
    const name = normalizeFolderName(body.name)

    if (!id || !name) {
      return NextResponse.json({ error: "Dados da pasta inválidos." }, { status: 400 })
    }

    const folder = await prisma.mediaFolder.findFirst({
      where: { id, userId },
      select: { id: true },
    })
    if (!folder) {
      return NextResponse.json({ error: "Pasta não encontrada." }, { status: 404 })
    }

    if (await duplicateFolderExists(userId, name, id)) {
      return NextResponse.json({ error: "Já existe uma pasta com esse nome." }, { status: 409 })
    }

    const updated = await prisma.mediaFolder.update({
      where: { id },
      data: { name },
      include: { _count: { select: { media: true } } },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error("Library folder update error", error)
    return NextResponse.json({ error: "Não foi possível renomear a pasta." }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const userId = await getUserId()
  if (!userId) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const id = String(body.id || "").trim()
    if (!id) {
      return NextResponse.json({ error: "Pasta inválida." }, { status: 400 })
    }

    const folder = await prisma.mediaFolder.findFirst({
      where: { id, userId },
      select: { id: true },
    })
    if (!folder) {
      return NextResponse.json({ error: "Pasta não encontrada." }, { status: 404 })
    }

    await prisma.mediaFolder.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Library folder delete error", error)
    return NextResponse.json({ error: "Não foi possível apagar a pasta." }, { status: 500 })
  }
}
