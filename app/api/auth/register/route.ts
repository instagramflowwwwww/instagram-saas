import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const name = String(body.name || "").trim().slice(0, 120)
    const email = String(body.email || "").trim().toLowerCase()
    const password = String(body.password || "")

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email e senha são obrigatórios" },
        { status: 400 }
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "A senha deve ter pelo menos 6 caracteres" },
        { status: 400 }
      )
    }

    const existingUser = await prisma.user.findUnique({ where: { email } })

    if (existingUser) {
      return NextResponse.json(
        { error: "Este email já está cadastrado" },
        { status: 400 }
      )
    }

    const hashedPassword = await bcrypt.hash(password, 12)

    await prisma.user.create({
      data: {
        name: name || null,
        email,
        password: hashedPassword,
        accessStatus: "pending",
        planName: null,
        planDurationDays: null,
        accessStartsAt: null,
        accessExpiresAt: null,
        approvedAt: null,
        rejectedAt: null,
      },
    })

    return NextResponse.json(
      {
        message:
          "Cadastro enviado para análise. Você poderá entrar depois que o administrador aprovar sua conta.",
      },
      { status: 201 }
    )
  } catch (error) {
    console.error("Erro ao registrar:", error)
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
  }
}
