"use client"
import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"
import { Instagram, Upload, CheckCircle, AlertCircle, Calendar, TrendingUp } from "lucide-react"
import Link from "next/link"

export default function DashboardPage() {
  const { data: session } = useSession()
  const [accounts, setAccounts] = useState<any[]>([])
  const [posts, setPosts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().split("T")[0]
  })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0])

  useEffect(() => {
    Promise.all([
      fetch("/api/instagram/accounts").then(r => r.json()),
      fetch(`/api/posts/stats?from=${dateFrom}&to=${dateTo}`).then(r => r.json()),
    ]).then(([accs, postsData]) => {
      setAccounts(accs)
      setPosts(postsData || [])
      setLoading(false)
    })
  }, [dateFrom, dateTo])

  const published = posts.filter((p: any) => p.status === "published" || p.status === "partial").length
  const errors = posts.filter((p: any) => p.status === "error").length
  const scheduled = posts.filter((p: any) => p.status === "scheduled").length

  const stats = [
    { label: "Contas conectadas", value: accounts.length, icon: Instagram, color: "text-purple-400", bg: "bg-purple-500/10" },
    { label: "Posts publicados", value: loading ? "..." : published, icon: CheckCircle, color: "text-green-400", bg: "bg-green-500/10" },
    { label: "Agendamentos", value: loading ? "..." : scheduled, icon: Calendar, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "Erros", value: loading ? "..." : errors, icon: AlertCircle, color: "text-red-400", bg: "bg-red-500/10" },
  ]

  const formatDate = (date: string) => {
    const [y, m, d] = date.split("-")
    return `${d}/${m}/${y}`
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Olá, {session?.user?.name?.split(" ")[0] || "usuário"} 👋
          </h1>
          <p className="text-gray-500 mt-1">Bem-vindo ao seu painel de controle teste</p>
        </div>

        {/* Filtro de data */}
        <div className="flex items-center gap-2 bg-[#111] border border-white/10 rounded-xl px-4 py-2.5">
          <Calendar size={14} className="text-gray-500" />
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="bg-transparent text-sm text-white focus:outline-none"
          />
          <span className="text-gray-600 text-sm">até</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="bg-transparent text-sm text-white focus:outline-none"
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-[#111] border border-white/5 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs text-gray-500 font-medium">{stat.label}</span>
              <div className={`w-8 h-8 rounded-lg ${stat.bg} flex items-center justify-center`}>
                <stat.icon size={14} className={stat.color} />
              </div>
            </div>
            <p className="text-3xl font-bold text-white">{stat.value}</p>
            <p className="text-xs text-gray-600 mt-1">{formatDate(dateFrom)} — {formatDate(dateTo)}</p>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <Link href="/dashboard/accounts" className="bg-[#111] border border-white/5 rounded-xl p-6 hover:border-purple-500/30 transition-all group">
          <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center mb-4 group-hover:bg-purple-500/20 transition-colors">
            <Instagram size={18} className="text-purple-400" />
          </div>
          <h3 className="font-semibold text-white mb-1">Conectar Instagram</h3>
          <p className="text-sm text-gray-500">Adicione suas contas do Instagram para publicar</p>
        </Link>
        <Link href="/dashboard/publish" className="bg-[#111] border border-white/5 rounded-xl p-6 hover:border-purple-500/30 transition-all group">
          <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center mb-4 group-hover:bg-purple-500/20 transition-colors">
            <Upload size={18} className="text-purple-400" />
          </div>
          <h3 className="font-semibold text-white mb-1">Publicar conteúdo</h3>
          <p className="text-sm text-gray-500">Envie vídeos e imagens para várias contas</p>
        </Link>
      </div>

      {/* Posts recentes */}
      {posts.length > 0 && (
        <div className="bg-[#111] border border-white/5 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={15} className="text-purple-400" />
            <h3 className="font-semibold text-white text-sm">Posts recentes</h3>
          </div>
          <div className="space-y-2">
            {posts.slice(0, 5).map((post: any) => (
              <div key={post.id} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  post.status === "published" ? "bg-green-400" :
                  post.status === "error" ? "bg-red-400" :
                  post.status === "scheduled" ? "bg-blue-400" : "bg-gray-400"
                }`} />
                <p className="text-sm text-gray-300 flex-1 truncate">{post.caption || "Sem legenda"}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  post.status === "published" ? "bg-green-500/10 text-green-400" :
                  post.status === "error" ? "bg-red-500/10 text-red-400" :
                  post.status === "scheduled" ? "bg-blue-500/10 text-blue-400" : "bg-gray-500/10 text-gray-400"
                }`}>
                  {post.status === "published" ? "Publicado" :
                   post.status === "error" ? "Erro" :
                   post.status === "scheduled" ? "Agendado" : post.status}
                </span>
                <span className="text-xs text-gray-600">
                  {new Date(post.createdAt).toLocaleDateString("pt-BR")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {accounts.length === 0 && (
        <div className="mt-8 bg-[#111] border border-white/5 rounded-xl p-10 text-center">
          <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center mx-auto mb-4">
            <Instagram size={22} className="text-purple-400" />
          </div>
          <h3 className="font-semibold text-white mb-2">Nenhuma conta conectada</h3>
          <p className="text-gray-500 text-sm mb-6">Conecte sua primeira conta do Instagram para começar</p>
          <Link href="/dashboard/accounts"
            className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors">
            <Instagram size={15} />
            Conectar agora
          </Link>
        </div>
      )}
    </div>
  )
}
