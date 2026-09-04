import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import bcrypt from "bcryptjs"
import crypto from "crypto"
import { isAdminEmail } from "@/lib/account-access"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"

// Gera uma senha temporária aleatória em vez de deixar o admin escolher —
// assim ela não vem de um padrão previsível, e ninguém (nem quem está
// resetando) fica sabendo a senha que a pessoa usava antes. É devolvida em
// texto puro só nesta resposta, uma única vez; a partir daqui só existe
// como hash no banco, igual qualquer outra senha do sistema.
function generateTempPassword() {
  return crypto.randomBytes(6).toString("base64url")
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, email: true, name: true },
  })

  if (!targetUser) {
    return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 })
  }

  if (isAdminEmail(targetUser.email)) {
    return NextResponse.json(
      { error: "Não é possível redefinir a senha de uma conta admin por aqui." },
      { status: 403 }
    )
  }

  const tempPassword = generateTempPassword()
  const hashedPassword = await bcrypt.hash(tempPassword, 12)

  await prisma.user.update({
    where: { id: targetUser.id },
    data: { password: hashedPassword },
  })

  return NextResponse.json({
    success: true,
    email: targetUser.email,
    temporaryPassword: tempPassword,
  })
}
