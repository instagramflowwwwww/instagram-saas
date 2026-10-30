"use client"
import { useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import {
  BarChart3,
  Calendar,
  Check,
  Eye,
  EyeOff,
  FolderOpen,
  Instagram,
  LayoutDashboard,
  ListChecks,
  Users,
} from "lucide-react"
import toast from "react-hot-toast"
import { Wordmark } from "@/components/Wordmark"

const FEATURES = ["Instagram", "Automação", "Biblioteca", "Fila", "Performance"]

const MOCK_TABS = [
  { icon: LayoutDashboard, label: "Dashboard" },
  { icon: Calendar, label: "Automação" },
  { icon: FolderOpen, label: "Biblioteca" },
  { icon: Users, label: "Contas" },
  { icon: BarChart3, label: "Performance" },
]

const MOCK_STATS = [
  { icon: Eye, value: "12.4K", label: "Views hoje" },
  { icon: ListChecks, value: "86", label: "Na fila" },
  { icon: Users, value: "34", label: "Contas ativas" },
]

const MOCK_QUEUE = [
  { username: "loja.ju", time: "14:30" },
  { username: "studio.leo", time: "15:00" },
]

export default function LoginPage() {
  const router = useRouter()
  const [isRegister, setIsRegister] = useState(false)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
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
          toast.error(data.error || "Erro ao criar conta")
          setLoading(false)
          return
        }
        setIsRegister(false)
        setPassword("")
        toast.success(
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
          toast.error("Seu cadastro ainda está aguardando aprovação do administrador.")
        } else if (authError.includes("ACCOUNT_REJECTED")) {
          toast.error("Seu cadastro foi recusado. Entre em contato com o administrador.")
        } else if (authError.includes("ACCOUNT_EXPIRED")) {
          toast.error("Seu plano expirou. Solicite a renovação ao administrador.")
        } else if (authError.includes("Usuário não encontrado")) {
          toast.error("Email não cadastrado")
        } else if (authError.includes("Senha incorreta")) {
          toast.error("Senha incorreta")
        } else {
          toast.error("Email ou senha inválidos")
        }
      } else {
        toast.success("Login realizado com sucesso.")
        router.push("/dashboard")
        router.refresh()
      }
    } catch {
      toast.error("Erro inesperado. Tente novamente.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex">
      {/* Painel esquerdo — só aparece em telas grandes */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between border-r border-white/5 px-16 py-12 relative overflow-hidden">
        <div
          className="pointer-events-none absolute -top-40 -left-40 h-96 w-96 rounded-full bg-purple-600/10 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute bottom-0 right-0 h-80 w-80 rounded-full bg-pink-600/10 blur-3xl"
          aria-hidden
        />

        <div className="relative flex items-center gap-3">
          <img
            src="/logo/logosfundo.png"
            alt="Logo InstaFlow"
            className="h-9 w-9 shrink-0 rounded-xl object-contain"
          />
          <Wordmark className="text-xl font-bold text-white" />
        </div>

        <div className="relative max-w-md">
          <div className="flex items-center gap-2 mb-4">
            <span className="h-px w-6 bg-purple-500" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-purple-400">
              Gestão de contas com método
            </span>
          </div>
          <h1 className="text-4xl font-bold text-white leading-tight mb-4">
            Publique no Instagram sem perder o ritmo.
          </h1>
          <p className="text-gray-500 mb-8">
            Conecte contas, organize a biblioteca e deixe a fila publicar no horário certo —
            tudo num painel só.
          </p>

          <div className="rounded-2xl border border-white/10 bg-[#0d0d0d] overflow-hidden shadow-2xl">
            <div className="flex items-center gap-1.5 border-b border-white/5 px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
              <div className="ml-3 flex gap-4">
                {MOCK_TABS.map((tab, index) => (
                  <span
                    key={tab.label}
                    className={`flex items-center gap-1.5 text-[11px] ${
                      index === 1 ? "text-purple-300" : "text-gray-600"
                    }`}
                  >
                    <tab.icon size={11} />
                    {tab.label}
                  </span>
                ))}
              </div>
            </div>
            <div className="bg-gradient-to-br from-purple-500/[0.03] to-pink-500/[0.03] p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-gray-400">Dashboard geral</span>
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[9px] text-gray-600">
                  Exemplo ilustrativo
                </span>
              </div>

              <div className="mb-3 grid grid-cols-3 gap-2">
                {MOCK_STATS.map((stat) => (
                  <div key={stat.label} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
                    <stat.icon size={12} className="mb-1.5 text-purple-400" />
                    <p className="text-sm font-bold text-white leading-none">{stat.value}</p>
                    <p className="mt-1 text-[9px] text-gray-600 leading-none">{stat.label}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-1.5">
                {MOCK_QUEUE.map((item) => (
                  <div
                    key={item.username}
                    className="flex items-center gap-2 rounded-lg border border-white/[0.05] bg-black/10 px-2.5 py-2"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-pink-500">
                      <Instagram size={9} className="text-white" />
                    </span>
                    <span className="flex-1 truncate text-[10px] text-gray-300">@{item.username}</span>
                    <span className="text-[9px] text-gray-600">{item.time}</span>
                    <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[8px] font-medium text-amber-300">
                      Na fila
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="relative flex flex-wrap gap-x-6 gap-y-2">
          {FEATURES.map((feature) => (
            <span key={feature} className="flex items-center gap-1.5 text-xs text-gray-500">
              <Check size={12} className="text-purple-400" />
              {feature}
            </span>
          ))}
        </div>
      </div>

      {/* Formulário */}
      <div className="flex w-full lg:w-1/2 items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-10 justify-center">
            <img
              src="/logo/logosfundo.png"
              alt="Logo InstaFlow"
              className="h-10 w-10 rounded-xl object-contain"
            />
            <Wordmark className="text-2xl font-bold text-white" />
          </div>

          <div className="flex items-center gap-2 mb-3">
            <span className="h-px w-6 bg-purple-500" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-purple-400">
              Painel operacional
            </span>
          </div>

          <h2 className="text-2xl font-bold text-white mb-2">
            {isRegister ? "Criar conta" : "Bem-vindo de volta"}
          </h2>
          <p className="text-gray-500 mb-8 text-sm">
            {isRegister
              ? "Preencha os dados abaixo para se cadastrar."
              : "Entre para continuar operando suas contas."}
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {isRegister && (
              <div>
                <label className="text-sm text-gray-400 mb-1.5 block">Nome (opcional)</label>
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
              <label className="text-sm text-gray-400 mb-1.5 block">E-mail</label>
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
              <label className="text-sm text-gray-400 mb-1.5 block">Senha</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isRegister ? "Mínimo 6 caracteres" : "••••••••"}
                  required
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-4 pr-11 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                  aria-label={showPassword ? "Esconder senha" : "Mostrar senha"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {!isRegister && (
              <div className="flex items-center justify-between text-xs">
                <label className="flex items-center gap-2 text-gray-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-white/20 bg-white/5 accent-purple-500"
                  />
                  Lembrar de mim
                </label>
                <span className="text-gray-600">Esqueceu a senha? (em breve)</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white font-medium py-3 px-4 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {loading ? "Aguarde..." : isRegister ? "Criar conta" : "Entrar"}
            </button>
          </form>

          <p className="text-center text-gray-500 text-sm mt-6">
            {isRegister ? "Já tem uma conta?" : "Não tem uma conta?"}{" "}
            <button
              onClick={() => setIsRegister(!isRegister)}
              className="text-purple-400 hover:text-purple-300 transition-colors font-medium"
            >
              {isRegister ? "Fazer login" : "Criar conta"}
            </button>
          </p>

          <p className="text-center text-gray-600 text-xs mt-6">
            Ao entrar, você concorda com nossos termos de uso
          </p>
        </div>
      </div>
    </div>
  )
}
