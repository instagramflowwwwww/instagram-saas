import type { NextAuthOptions } from "next-auth"
import { PrismaAdapter } from "@next-auth/prisma-adapter"
import CredentialsProvider from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import {
  getEffectiveAccessStatus,
  isAdminEmail,
} from "@/lib/account-access"
import { prisma } from "@/lib/prisma"

// instaflowapp.com.br e www.instaflowapp.com.br respondem os dois direto,
// sem redirecionar um pro outro — sem isso aqui, o cookie de sessão fica
// preso no host exato onde foi feito o login (ex.: logou em www., depois
// abriu sem o www.) e aparece como "desconectado" mesmo a sessão valendo
// 180 dias. O domínio com ponto na frente cobre os dois hosts.
const isProduction = process.env.NODE_ENV === "production"
const sessionCookieName = isProduction
  ? "__Secure-next-auth.session-token"
  : "next-auth.session-token"

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  cookies: {
    sessionToken: {
      name: sessionCookieName,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isProduction,
        domain: isProduction ? ".instaflowapp.com.br" : undefined,
      },
    },
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: {
          label: "Email",
          type: "email",
        },
        password: {
          label: "Senha",
          type: "password",
        },
      },
      async authorize(credentials) {
        const email = String(credentials?.email || "").trim().toLowerCase()
        const password = String(credentials?.password || "")

        if (!email || !password) {
          throw new Error("Email e senha são obrigatórios")
        }

        const user = await prisma.user.findUnique({ where: { email } })

        if (!user?.password) {
          throw new Error("Usuário não encontrado")
        }

        const passwordMatch = await bcrypt.compare(password, user.password)

        if (!passwordMatch) {
          throw new Error("Senha incorreta")
        }

        const effectiveStatus = getEffectiveAccessStatus(user)

        if (!isAdminEmail(user.email)) {
          if (effectiveStatus === "pending") throw new Error("ACCOUNT_PENDING")
          if (effectiveStatus === "rejected") throw new Error("ACCOUNT_REJECTED")
          if (effectiveStatus === "expired") {
            if (user.accessStatus !== "expired") {
              await prisma.user.update({
                where: { id: user.id },
                data: { accessStatus: "expired" },
              })
            }
            throw new Error("ACCOUNT_EXPIRED")
          }
          if (effectiveStatus !== "approved") throw new Error("ACCOUNT_BLOCKED")
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
        }
      },
    }),
  ],
  session: {
    strategy: "jwt",
    // Fica logado por 180 dias sem precisar entrar de novo, em vez do
    // padrão de 30 dias do NextAuth.
    maxAge: 180 * 24 * 60 * 60,
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id

      const userId = typeof token.id === "string" ? token.id : ""
      if (!userId) return token

      const access = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          accessStatus: true,
          planName: true,
          accessExpiresAt: true,
        },
      })

      if (!access) {
        token.id = undefined
        token.accessStatus = "rejected"
        return token
      }

      const effectiveStatus = getEffectiveAccessStatus(access)
      token.accessStatus = effectiveStatus
      token.planName = access.planName || undefined
      token.accessExpiresAt = access.accessExpiresAt?.toISOString()
      token.name = access.name || undefined
      token.picture = access.image || undefined

      if (!isAdminEmail(access.email) && effectiveStatus !== "approved") {
        token.id = undefined
      }

      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = typeof token.id === "string" ? token.id : ""
        session.user.image = typeof token.picture === "string" ? token.picture : null
        session.user.accessStatus = String(token.accessStatus || "approved")
        session.user.planName =
          typeof token.planName === "string" ? token.planName : null
        session.user.accessExpiresAt =
          typeof token.accessExpiresAt === "string"
            ? token.accessExpiresAt
            : null
      }

      return session
    },
  },
}
