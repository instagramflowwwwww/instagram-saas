"use client"
import { useEffect, useState } from "react"
import { Heart, MessageCircle, ExternalLink, TrendingUp, Instagram, Play } from "lucide-react"

export default function PerformancePage() {
  const [posts, setPosts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/posts/performance")
      .then((r) => r.json())
      .then((data) => {
        setPosts(data)
        setLoading(false)
      })
  }, [])

  const totalLikes = posts.reduce((sum, p) => sum + (p.likeCount || 0), 0)
  const totalComments = posts.reduce((sum, p) => sum + (p.commentsCount || 0), 0)
  const totalViews = posts.reduce((sum, p) => sum + (p.videoViews || 0), 0)

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Performance</h1>
        <p className="text-gray-500 mt-1">Métricas dos seus últimos posts publicados</p>
      </div>
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-[#111] border border-white/5 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-gray-500 font-medium">Posts analisados</span>
            <TrendingUp size={14} className="text-purple-400" />
          </div>
          <p className="text-2xl font-bold text-white">{loading ? "..." : posts.length}</p>
        </div>
        <div className="bg-[#111] border border-white/5 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-gray-500 font-medium">Total de curtidas</span>
            <Heart size={14} className="text-pink-400" />
          </div>
          <p className="text-2xl font-bold text-white">{loading ? "..." : totalLikes.toLocaleString()}</p>
        </div>
        <div className="bg-[#111] border border-white/5 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-gray-500 font-medium">Total de comentários</span>
            <MessageCircle size={14} className="text-blue-400" />
          </div>
          <p className="text-2xl font-bold text-white">{loading ? "..." : totalComments.toLocaleString()}</p>
        </div>
        <div className="bg-[#111] border border-white/5 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-gray-500 font-medium">Total de views</span>
            <Play size={14} className="text-purple-400" />
          </div>
          <p className="text-2xl font-bold text-white">{loading ? "..." : totalViews.toLocaleString()}</p>
        </div>
      </div>
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {!loading && posts.length === 0 && (
        <div className="bg-[#111] border border-white/5 rounded-xl p-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-purple-500/10 flex items-center justify-center mx-auto mb-5">
            <TrendingUp size={24} className="text-purple-400" />
          </div>
          <h3 className="font-semibold text-white mb-2">Nenhum post publicado ainda</h3>
          <p className="text-gray-500 text-sm max-w-sm mx-auto">
            Assim que você publicar conteúdo pelas suas contas conectadas, as métricas aparecerão aqui.
          </p>
        </div>
      )}
      {!loading && posts.length > 0 && (
        <div className="space-y-3">
          {posts.map((post) => (
            <div key={post.id} className="bg-[#111] border border-white/5 rounded-xl p-5 flex items-center gap-4">
              {post.profilePicture ? (
                <img src={post.profilePicture} alt="" className="w-10 h-10 rounded-full flex-shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
                  <Instagram size={16} className="text-white" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium">@{post.username}</p>
                <p className="text-xs text-gray-500 truncate mt-0.5">{post.caption || "Sem legenda"}</p>
              </div>
              {post.error ? (
                <span className="text-xs text-red-400 flex-shrink-0">{post.error}</span>
              ) : (
                <div className="flex items-center gap-4 flex-shrink-0">
                  <div className="flex items-center gap-1.5 text-sm text-gray-300">
                    <Heart size={14} className="text-pink-400" />
                    {post.likeCount?.toLocaleString() ?? "—"}
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-gray-300">
                    <MessageCircle size={14} className="text-blue-400" />
                    {post.commentsCount?.toLocaleString() ?? "—"}
                  </div>
                  {post.videoViews !== null && post.videoViews !== undefined && (
                    <div className="flex items-center gap-1.5 text-sm text-gray-300">
                      <Play size={14} className="text-purple-400" />
                      {post.videoViews?.toLocaleString() ?? "—"}
                    </div>
                  )}
                  {post.permalink && (
                    <a href={post.permalink} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-white">
                      <ExternalLink size={14} />
                    </a>
                  )}
                </div>
              )}
              <span className="text-xs text-gray-600 flex-shrink-0">
                {new Date(post.publishedAt).toLocaleDateString("pt-BR")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
