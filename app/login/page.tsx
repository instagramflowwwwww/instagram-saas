"use client"
import { useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Instagram } from "lucide-react"

export default function LoginPage() {
  const router = useRouter()
  const [isRegister, setIsRegister] = useState(false)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setSuccess("")
    setLoading(true)

    try {
      if (isRegister) {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password }),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || "Erro ao criar conta")
          setLoading(false)
          return
        }
        setIsRegister(false)
        setPassword("")
        setSuccess(
          data.message ||
            "Cadastro enviado para análise. Aguarde a aprovação do administrador."
        )
        setLoading(false)
        return
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      })

      if (result?.error) {
        const authError = decodeURIComponent(result.error)

        if (authError.includes("ACCOUNT_PENDING")) {
          setError("Seu cadastro ainda está aguardando aprovação do administrador.")
        } else if (authError.includes("ACCOUNT_REJECTED")) {
          setError("Seu cadastro foi recusado. Entre em contato com o administrador.")
        } else if (authError.includes("ACCOUNT_EXPIRED")) {
          setError("Seu plano expirou. Solicite a renovação ao administrador.")
        } else if (authError.includes("Usuário não encontrado")) {
          setError("Email não cadastrado")
        } else if (authError.includes("Senha incorreta")) {
          setError("Senha incorreta")
        } else {
          setError("Email ou senha inválidos")
        }
      } else {
        router.push("/dashboard")
        router.refresh()
      }
    } catch {
      setError("Erro inesperado. Tente novamente.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <div className="w-full max-w-md p-8">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-12 justify-center">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <Instagram size={20} className="text-white" />
          </div>
          <span className="text-2xl font-bold text-white">InstaFlow</span>
        </div>

        {/* Card */}
        <div className="bg-[#111] border border-white/10 rounded-2xl p-8">
          <h1 className="text-2xl font-bold text-white mb-2">
            {isRegister ? "Criar conta" : "Bem-vindo"}
          </h1>
          <p className="text-gray-400 mb-8 text-sm">
            {isRegister
              ? "Preencha os dados abaixo para se cadastrar"
              : "Faça login para gerenciar suas contas do Instagram"}
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {isRegister && (
              <div>
                <label className="text-sm text-gray-400 mb-1 block">
                  Nome (opcional)
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>
            )}

            <div>
              <label className="text-sm text-gray-400 mb-1 block">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>

            <div>
              <label className="text-sm text-gray-400 mb-1 block">Senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isRegister ? "Mínimo 6 caracteres" : "••••••••"}
                required
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>

            {success && (
              <p className="text-green-300 text-sm bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
                {success}
              </p>
            )}

            {error && (
              <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-3">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white font-medium py-3 px-4 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {loading
                ? "Aguarde..."
                : isRegister
                ? "Criar conta"
                : "Entrar"}
            </button>
          </form>

          <p className="text-center text-gray-500 text-sm mt-6">
            {isRegister ? "Já tem uma conta?" : "Não tem uma conta?"}{" "}
            <button
              onClick={() => {
                setIsRegister(!isRegister)
                setError("")
                setSuccess("")
              }}
              className="text-purple-400 hover:text-purple-300 transition-colors font-medium"
            >
              {isRegister ? "Fazer login" : "Criar conta"}
            </button>
          </p>
        </div>

        <p className="text-center text-gray-600 text-xs mt-6">
          Ao entrar, você concorda com nossos termos de uso
        </p>
      </div>
    </div>
  )
}
