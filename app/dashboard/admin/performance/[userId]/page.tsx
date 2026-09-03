"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import {
  ArrowLeft,
  ExternalLink,
  Eye,
  Heart,
  Instagram,
  Loader2,
  MessageCircle,
} from "lucide-react"
import toast from "react-hot-toast"

type AdminPost = {
  id: string
  username: string
  profilePicture: string | null
  caption: string | null
  permalink: string | null
  likeCount: number | null
  commentsCount: number | null
  viewsCount: number | null
  viewsMetric: string | null
  mediaType: string | null
  mediaProductType: string | null
  publishedAt: string
  performanceUpdatedAt: string | null
  error: string | null
}

type AdminUserSummary = {
  id: string
  name: string | null
  email: string | null
}

function formatNumber(value: number | null) {
  if (value === null) return "—"
  return new Intl.NumberFormat("pt-BR").format(value)
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

export default function AdminUserPerformancePage() {
  const params = useParams<{ userId: string }>()
  const [user, setUser] = useState<AdminUserSummary | null>(null)
  const [posts, setPosts] = useState<AdminPost[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch(`/api/admin/users/${params.userId}/performance`, {
          cache: "no-store",
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "Não foi possível carregar.")
        setUser(data.user)
        setPosts(data.posts)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Erro ao carregar.")
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [params.userId])

  // Menos visualizações primeiro — é o que interessa para achar o que flopou.
  const sorted = [...posts].sort((a, b) => {
    if (a.viewsCount === null && b.viewsCount === null) return 0
    if (a.viewsCount === null) return 1
    if (b.viewsCount === null) return -1
    return a.viewsCount - b.viewsCount
  })

  const withViews = posts.filter((post) => post.viewsCount !== null)
  const totalViews = withViews.reduce((total, post) => total + (post.viewsCount || 0), 0)
  const averageViews = withViews.length > 0 ? Math.round(totalViews / withViews.length) : 0

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 size={24} className="animate-spin text-purple-400" />
      </div>
    )
  }

  return (
    <div>
      <Link
        href="/dashboard/admin"
        className="mb-6 inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-white"
      >
        <ArrowLeft size={13} />
        Voltar para o Admin
      </Link>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">
          Performance de {user?.name || user?.email || "usuário"}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {user?.email} · dados já salvos no banco — esta tela não consulta a Meta.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-white/[0.07] bg-[#111] p-5">
          <p className="text-[10px] uppercase tracking-wide text-gray-600">Posts com dado</p>
          <p className="mt-1.5 text-2xl font-semibold tabular-nums text-white">{posts.length}</p>
        </div>
        <div className="rounded-2xl border border-white/[0.07] bg-[#111] p-5">
          <p className="text-[10px] uppercase tracking-wide text-gray-600">Com visualizações</p>
          <p className="mt-1.5 text-2xl font-semibold tabular-nums text-white">{withViews.length}</p>
        </div>
        <div className="rounded-2xl border border-white/[0.07] bg-[#111] p-5">
          <p className="text-[10px] uppercase tracking-wide text-gray-600">Média de views</p>
          <p className="mt-1.5 text-2xl font-semibold tabular-nums text-white">{formatNumber(averageViews)}</p>
        </div>
        <div className="rounded-2xl border border-white/[0.07] bg-[#111] p-5">
          <p className="text-[10px] uppercase tracking-wide text-gray-600">Total de views</p>
          <p className="mt-1.5 text-2xl font-semibold tabular-nums text-white">{formatNumber(totalViews)}</p>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-[#111] py-16 text-center">
          <p className="text-sm text-gray-500">Nenhum post com dado de performance ainda.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/[0.07] bg-[#111]">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left text-[11px] text-gray-500">
                <th className="px-5 py-3 font-medium">Conta</th>
                <th className="px-5 py-3 font-medium">Publicado em</th>
                <th className="px-5 py-3 font-medium">Views</th>
                <th className="px-5 py-3 font-medium">Curtidas</th>
                <th className="px-5 py-3 font-medium">Comentários</th>
                <th className="px-5 py-3 font-medium">Legenda</th>
                <th className="px-5 py-3 text-right font-medium">Post</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((post) => (
                <tr key={post.id} className="border-b border-white/5 last:border-0">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/5">
                        {post.profilePicture ? (
                          <img src={post.profilePicture} alt="" className="h-5 w-5 rounded-full object-cover" />
                        ) : (
                          <Instagram size={12} className="text-gray-500" />
                        )}
                      </span>
                      <span className="text-white">@{post.username}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-xs text-gray-400">{formatDate(post.publishedAt)}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1.5">
                      <Eye size={12} className="text-gray-600" />
                      <span className="tabular-nums text-white">{formatNumber(post.viewsCount)}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1.5">
                      <Heart size={12} className="text-gray-600" />
                      <span className="tabular-nums text-gray-300">{formatNumber(post.likeCount)}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1.5">
                      <MessageCircle size={12} className="text-gray-600" />
                      <span className="tabular-nums text-gray-300">{formatNumber(post.commentsCount)}</span>
                    </div>
                  </td>
                  <td className="max-w-[220px] px-5 py-4 text-xs text-gray-500">
                    <p className="truncate">{post.caption || "—"}</p>
                    {post.error && <p className="mt-1 text-[11px] text-yellow-400/80">{post.error}</p>}
                  </td>
                  <td className="px-5 py-4 text-right">
                    {post.permalink ? (
                      <a
                        href={post.permalink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300"
                      >
                        Abrir <ExternalLink size={11} />
                      </a>
                    ) : (
                      <span className="text-xs text-gray-600">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
