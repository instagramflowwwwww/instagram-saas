import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { createAccountSwitchToken } from "@/lib/account-switch"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Gera um token pra essa conta (usuário logado agora) entrar na lista de
// "contas salvas" do navegador — é isso que permite voltar pra ela depois
// com um clique, sem digitar email/senha de novo.
export async function POST() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const token = createAccountSwitchToken(session.user.id)

  return NextResponse.json({ token })
}
