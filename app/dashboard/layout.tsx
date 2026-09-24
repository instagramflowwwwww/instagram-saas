"use client"
import { useSession, signOut } from "next-auth/react"
import { useRouter, usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import Link from "next/link"
import toast from "react-hot-toast"
import { isAdminEmail } from "@/lib/account-access"
import {
  LayoutDashboard, Instagram, Upload, Calendar,
  History, Settings, LogOut, FolderOpen,
  ListChecks, Star, TrendingUp, Shield, Boxes, Users, Menu, X, Activity, Banknote, Link2, Plug
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
      { href: "/dashboard/story-link", icon: Link2, label: "Story com link" },
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
      { href: "/dashboard/health", icon: Activity, label: "Saúde das contas" },
      { href: "/dashboard/groups", icon: Users, label: "Pastas" },
      { href: "/dashboard/payments", icon: Banknote, label: "Pagamentos" },
      { href: "/dashboard/meta-app", icon: Boxes, label: "App Meta" },
      { href: "/dashboard/queue", icon: ListChecks, label: "Status da Fila" },
      { href: "/dashboard/api-intermediaria", icon: Plug, label: "API intermediária" },
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
  const [mobileOpen, setMobileOpen] = useState(false)
  const [desktopExpanded, setDesktopExpanded] = useState(false)

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

  // Fecha menu ao trocar de página no mobile
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

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

  const Sidebar = ({ collapsed = false, onClose }: { collapsed?: boolean; onClose?: () => void }) => (
    <aside className="flex h-full flex-col overflow-hidden bg-[#0d0d0d] border-r border-white/5">
      <div className={`flex items-center border-b border-white/5 ${collapsed ? "justify-center p-4" : "justify-between p-6"}`}>
        <div className="flex items-center gap-3">
          <img
            src="/logo/logosfundo.png"
            alt="Logo InstaFlow"
            className="h-8 w-8 shrink-0 rounded-lg object-contain"
          />
          {!collapsed && <span className="whitespace-nowrap font-bold text-white">InstaFlow</span>}
        </div>
        {!collapsed && onClose && (
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <X size={20} />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto overflow-x-hidden p-4">
        {groups.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <p className="mb-2 whitespace-nowrap px-3 text-[10px] font-semibold uppercase tracking-wider text-gray-600">
                {group.label}
              </p>
            )}
            <div className="space-y-1">
              {group.items.map((item) => {
                const active = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                      collapsed ? "justify-center" : ""
                    } ${
                      active
                        ? "bg-purple-500/15 text-purple-400"
                        : "text-gray-500 hover:bg-white/5 hover:text-gray-200"
                    }`}
                  >
                    <item.icon size={16} className="shrink-0" />
                    {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className={`border-t border-white/5 ${collapsed ? "p-3" : "p-4"}`}>
        <div className={`flex items-center gap-3 ${collapsed ? "justify-center" : "mb-3"}`}>
          {session?.user?.image && (
            <img src={session.user.image} alt="" className="h-8 w-8 shrink-0 rounded-full" />
          )}
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{session?.user?.name}</p>
              <p className="truncate text-xs text-gray-500">{session?.user?.email}</p>
            </div>
          )}
        </div>
        <button
          onClick={() => {
            toast.success("Sessão encerrada.")
            void signOut({ callbackUrl: "/login" })
          }}
          title={collapsed ? "Sair" : undefined}
          className={`flex items-center gap-2 text-xs text-gray-500 transition-colors hover:text-gray-300 ${
            collapsed ? "mt-3 w-full justify-center" : ""
          }`}
        >
          <LogOut size={13} />
          {!collapsed && <span className="whitespace-nowrap">Sair</span>}
        </button>
      </div>
    </aside>
  )

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex">
      {/* Overlay mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Menu mobile — gaveta que só abre com o toque no hambúrguer */}
      <div className={`fixed top-0 left-0 h-full w-72 z-50 md:hidden transition-transform duration-300 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <Sidebar onClose={() => setMobileOpen(false)} />
      </div>

      {/* Menu desktop — trilho fino que expande ao passar o mouse por cima */}
      <div
        onMouseEnter={() => setDesktopExpanded(true)}
        onMouseLeave={() => setDesktopExpanded(false)}
        className={`fixed top-0 left-0 z-40 hidden h-full transition-all duration-200 md:block ${
          desktopExpanded ? "w-60" : "w-16"
        }`}
      >
        <Sidebar collapsed={!desktopExpanded} />
      </div>

      {/* Conteúdo principal */}
      <main className="flex-1 flex flex-col min-h-screen">
        {/* Header mobile com o hambúrguer */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#0d0d0d] border-b border-white/5 sticky top-0 z-30 md:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="text-gray-400 hover:text-white p-1"
          >
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2">
            <img
              src="/logo/logosfundo.png"
              alt="Logo InstaFlow"
              className="h-7 w-7 rounded-lg object-contain"
            />
            <span className="font-bold text-white text-sm">InstaFlow</span>
          </div>
          <div className="w-8" />
        </div>

        <div className="flex-1 p-4 md:p-8 md:ml-16">
          {children}
        </div>
      </main>
    </div>
  )
}
