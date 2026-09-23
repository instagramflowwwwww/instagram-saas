import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { decryptValue, encryptValue } from "@/lib/secure-store"
import { acceptTesterInvite, loginToInstagram } from "@/lib/unofficial-instagram"
import type { Cookie } from "playwright-core"

export const runtime = "nodejs"
export const maxDuration = 120

const BATCH_SIZE = 2

async function processAccount(account: {
  id: string
  username: string
  passwordEncrypted: string
  totpSecretEncrypted: string | null
  proxyUrl: string | null
  sessionEncrypted: string | null
  status: string
}) {
  let cookies: Cookie[] | null = null

  if (account.status === "logged_in" && account.sessionEncrypted) {
    try {
      cookies = JSON.parse(decryptValue(account.sessionEncrypted)) as Cookie[]
    } catch {
      cookies = null
    }
  }

  if (!cookies) {
    const loginResult = await loginToInstagram({
      username: account.username,
      password: decryptValue(account.passwordEncrypted),
      totpSecret: account.totpSecretEncrypted ? decryptValue(account.totpSecretEncrypted) : null,
      proxyUrl: account.proxyUrl,
    })

    if (loginResult.status !== "logged_in") {
      return {
        status: loginResult.status,
        lastError: loginResult.message,
        diagnostic: loginResult.diagnostic ?? null,
      }
    }

    cookies = loginResult.cookies
    await prisma.unofficialAccount.update({
      where: { id: account.id },
      data: {
        status: "logged_in",
        sessionEncrypted: encryptValue(JSON.stringify(cookies)),
        lastError: null,
        lastAttemptAt: new Date(),
      },
    })
  }

  const inviteResult = await acceptTesterInvite({ cookies, proxyUrl: account.proxyUrl })

  if (inviteResult.status === "invite_accepted") {
    return { status: "invite_accepted", lastError: null, diagnostic: null }
  }
  if (inviteResult.status === "no_invite_found") {
    return {
      status: "logged_in",
      lastError: "Nenhum convite de testador pendente encontrado.",
      diagnostic: inviteResult.diagnostic ?? null,
    }
  }
  return {
    status: "failed",
    lastError: inviteResult.message,
    diagnostic: inviteResult.diagnostic ?? null,
  }
}

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const accounts = await prisma.unofficialAccount.findMany({
    where: {
      userId: session.user.id,
      status: { in: ["pending", "logged_in", "failed", "checkpoint_required"] },
    },
    orderBy: { lastAttemptAt: { sort: "asc", nulls: "first" } },
    take: BATCH_SIZE,
  })

  const results = []

  for (const account of accounts) {
    await prisma.unofficialAccount.update({
      where: { id: account.id },
      data: { status: "logging_in", lastAttemptAt: new Date() },
    })

    const outcome = await processAccount(account)

    await prisma.unofficialAccount.update({
      where: { id: account.id },
      data: {
        status: outcome.status,
        lastError: outcome.lastError,
        lastDiagnostic: outcome.diagnostic,
        lastAttemptAt: new Date(),
      },
    })

    results.push({
      id: account.id,
      username: account.username,
      status: outcome.status,
      lastError: outcome.lastError,
    })
  }

  return NextResponse.json({ processed: results.length, results })
}
