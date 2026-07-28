import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { encryptInstagramSession } from "@/lib/instagram-session"
import { parseProxyUrl } from "@/lib/proxy"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const maxDuration = 300

type WorkerError = {
  code?: string
  message: string
}

function getWorkerError(payload: any): WorkerError {
  const detail = payload?.detail

  if (typeof detail === "string") {
    return { code: payload?.code, message: detail }
  }

  if (detail && typeof detail === "object") {
    return {
      code: detail.code,
      message: detail.message || "Erro ao conectar a conta do Instagram",
    }
  }

  return {
    code: payload?.code,
    message:
      payload?.error ||
      payload?.message ||
      "Erro ao conectar a conta do Instagram",
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const workerKey = process.env.INSTAGRAPI_WORKER_API_KEY
    if (!workerKey) {
      return NextResponse.json(
        { error: "INSTAGRAPI_WORKER_API_KEY não configurada na Vercel" },
        { status: 500 }
      )
    }

    const body = await request.json()
    const username = String(body.username || "")
      .trim()
      .replace(/^@/, "")
      .toLowerCase()
    const password = String(body.password || "")
    const verificationCode = String(body.verificationCode || "").trim()
    const proxy = body.proxy ? parseProxyUrl(String(body.proxy)) : null

    if (!username || !password) {
      return NextResponse.json(
        { error: "Informe o usuário e a senha do Instagram" },
        { status: 400 }
      )
    }

    const existingAccount = await prisma.instagramAccount.findFirst({
      where: {
        userId: session.user.id,
        instagramUsername: username,
      },
    })

    if (!existingAccount) {
      const accountCount = await prisma.instagramAccount.count({
        where: { userId: session.user.id },
      })

      if (accountCount >= 30) {
        return NextResponse.json(
          { error: "Limite de 30 contas conectadas atingido" },
          { status: 400 }
        )
      }
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 280_000)
    let workerResponse: Response

    try {
      workerResponse = await fetch(new URL("/api/index", request.url), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Worker-Key": workerKey,
        },
        body: JSON.stringify({
          action: "login",
          username,
          password,
          verification_code: verificationCode || null,
          proxy,
        }),
        cache: "no-store",
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }

    const workerData = await workerResponse.json().catch(() => ({}))

    if (!workerResponse.ok) {
      const workerError = getWorkerError(workerData)

      return NextResponse.json(
        {
          error: workerError.message,
          code: workerError.code,
          requiresTwoFactor: workerError.code === "TWO_FACTOR_REQUIRED",
        },
        { status: workerResponse.status }
      )
    }

    if (!workerData.session || !workerData.account?.id) {
      return NextResponse.json(
        { error: "A função Python não retornou uma sessão válida do Instagram" },
        { status: 502 }
      )
    }

    const instagramId = String(workerData.account.id)
    const linkedToAnotherUser = await prisma.instagramAccount.findFirst({
      where: {
        igUserId: instagramId,
        NOT: { userId: session.user.id },
      },
      select: { id: true },
    })

    if (linkedToAnotherUser) {
      return NextResponse.json(
        { error: "Esta conta do Instagram já está vinculada a outro usuário" },
        { status: 409 }
      )
    }

    const accountByInstagramId = await prisma.instagramAccount.findFirst({
      where: {
        userId: session.user.id,
        igUserId: instagramId,
      },
    })

    const accountToUpdate = accountByInstagramId || existingAccount
    const connectedUsername = String(
      workerData.account.username || username
    ).toLowerCase()
    const followerCount = Number(workerData.account.follower_count)
    const accountData = {
      igUserId: instagramId,
      username: connectedUsername,
      instagramUsername: connectedUsername,
      instagramPassword: null,
      profilePicture: workerData.account.profile_picture || null,
      followerCount: Number.isFinite(followerCount) ? followerCount : null,
      sessionFilePath: encryptInstagramSession(workerData.session),
      proxy,
      isActive: true,
      lastActiveAt: new Date(),
    }

    const account = accountToUpdate
      ? await prisma.instagramAccount.update({
          where: { id: accountToUpdate.id },
          data: accountData,
          select: {
            id: true,
            username: true,
            profilePicture: true,
            followerCount: true,
            isActive: true,
            proxy: true,
            lastActiveAt: true,
          },
        })
      : await prisma.instagramAccount.create({
          data: {
            userId: session.user.id,
            ...accountData,
          },
          select: {
            id: true,
            username: true,
            profilePicture: true,
            followerCount: true,
            isActive: true,
            proxy: true,
            lastActiveAt: true,
          },
        })

    return NextResponse.json({
      message: "Conta conectada com sucesso",
      account,
    })
  } catch (error: any) {
    const message =
      error?.name === "AbortError"
        ? "A conexão com o Instagram demorou demais e foi interrompida"
        : error?.message || "Erro interno ao conectar o Instagram"

    console.error("Instagram login error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
