"use client"
import { useSession, signOut } from "next-auth/react"
import { useRouter, usePathname } from "next/navigation"
import { useEffect, useRef } from "react"
import Link from "next/link"
import toast from "react-hot-toast"
import { isAdminEmail } from "@/lib/account-access"
import {
  LayoutDashboard, Instagram, Upload, Calendar,
  History, Settings, LogOut, FolderOpen,
  ListChecks, Star, TrendingUp, Shield, Boxes
} from "lucide-react"


const navGroups = [
  {
    label: "Principal",
    items: [
      { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    ],
  },
  {
    label: "Publicação",
    items: [
      { href: "/dashboard/publish", icon: Upload, label: "Postar" },
      { href: "/dashboard/schedule", icon: Calendar, label: "Automação" },
      { href: "/dashboard/stories", icon: Star, label: "Stories" },
    ],
  },
  {
    label: "Conteúdo",
    items: [
      { href: "/dashboard/library", icon: FolderOpen, label: "Biblioteca" },
      { href: "/dashboard/performance", icon: TrendingUp, label: "Performance" },
      { href: "/dashboard/history", icon: History, label: "Histórico" },
    ],
  },
  {
    label: "Operação",
    items: [
      { href: "/dashboard/accounts", icon: Instagram, label: "Contas" },
      { href: "/dashboard/meta-app", icon: Boxes, label: "App Meta" },
      { href: "/dashboard/queue", icon: ListChecks, label: "Status da Fila" },
    ],
  },
  {
    label: "Conta",
    items: [
      { href: "/dashboard/settings", icon: Settings, label: "Configurações" },
    ],
  },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const queueTickRunning = useRef(false)

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login")
      return
    }

    if (status === "authenticated" && !session?.user?.id) {
      toast.error("Sua sessão é inválida. Faça login novamente.", { id: "invalid-session" })
      void signOut({ callbackUrl: "/login" })
    }
  }, [session?.user?.id, status, router])

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.id) return

    let disposed = false

    const processQueue = async () => {
      if (disposed || queueTickRunning.current) return
      queueTickRunning.current = true

      try {
        const response = await fetch("/api/queue/process", {
          method: "POST",
          cache: "no-store",
          keepalive: true,
        })

        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          throw new Error(data.error || "Não foi possível processar a fila de publicações.")
        }

        toast.dismiss("queue-heartbeat-error")
      } catch (error) {
        console.error("[queue-dashboard] Heartbeat failed", error)
        toast.error(
          error instanceof Error
            ? error.message
            : "Não foi possível processar a fila de publicações.",
          { id: "queue-heartbeat-error" }
        )
      } finally {
        queueTickRunning.current = false
      }
    }

    void processQueue()
    const interval = window.setInterval(processQueue, 60_000)

    return () => {
      disposed = true
      window.clearInterval(interval)
    }
  }, [session?.user?.id, status])

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const isAdmin = isAdminEmail(session?.user?.email)

  const groups = isAdmin
    ? [
        ...navGroups,
        {
          label: "Administração",
          items: [
            { href: "/dashboard/admin", icon: Shield, label: "Painel Admin" },
          ],
        },
      ]
    : navGroups

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex">
      <aside className="w-60 bg-[#0d0d0d] border-r border-white/5 flex flex-col fixed h-full">
        <div className="p-6 border-b border-white/5">
          <div className="flex items-center gap-3">
            <img
              src="/logo/logosfundo.png"
              alt="Logo InstaFlow"
              className="h-8 w-8 rounded-lg object-contain"
            />
            <span className="font-bold text-white">InstaFlow</span>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-5 overflow-y-auto">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider px-3 mb-2">
                {group.label}
              </p>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const active = pathname === item.href
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                        active
                          ? "bg-purple-500/15 text-purple-400"
                          : "text-gray-500 hover:text-gray-200 hover:bg-white/5"
                      }`}
                    >
                      <item.icon size={16} />
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-white/5">
          <div className="flex items-center gap-3 mb-3">
            {session?.user?.image && (
              <img src={session.user.image} alt="" className="w-8 h-8 rounded-full" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{session?.user?.name}</p>
              <p className="text-xs text-gray-500 truncate">{session?.user?.email}</p>
            </div>
          </div>
          <button
            onClick={() => {
              toast.success("Sessão encerrada.")
              void signOut({ callbackUrl: "/login" })
            }}
            className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            <LogOut size={13} />
            Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 ml-60 p-8">
        {children}
      </main>
    </div>
  )
}
