"use client"
import { useSession, signOut } from "next-auth/react"
import { useRouter, usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import Link from "next/link"
import toast from "react-hot-toast"
import { isAdminEmail } from "@/lib/account-access"
import { AssistantWidget } from "@/components/AssistantWidget"
import { AccountSwitcher } from "@/components/AccountSwitcher"
import { Wordmark } from "@/components/Wordmark"
import {
  LayoutDashboard, Instagram, Upload, Calendar,
  History, Settings, LogOut, FolderOpen,
  ListChecks, Star, TrendingUp, Shield, Boxes, Users, Menu, X, Activity, Banknote, Bell, Gem
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
      { href: "/dashboard/health", icon: Activity, label: "Saúde das contas" },
      { href: "/dashboard/groups", icon: Users, label: "Pastas" },
      { href: "/dashboard/payments", icon: Banknote, label: "Pagamentos" },
      { href: "/dashboard/meta-app", icon: Boxes, label: "App Meta" },
      { href: "/dashboard/queue", icon: ListChecks, label: "Status da Fila" },
    ],
  },
  {
    label: "Conta",
    items: [
      { href: "/dashboard/plans", icon: Gem, label: "Planos" },
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
    }
    // Se o acesso não está mais aprovado (plano expirado, pendente, etc.) a
    // gente NÃO desloga sozinho — só mostra a tela de bloqueio abaixo. A
    // sessão continua válida: assim que o acesso voltar a ficar aprovado, a
    // próxima verificação já libera tudo de novo, sem precisar logar de
    // novo. Deslogar fica só a critério do próprio usuário, no botão "Sair".
  }, [status, router])

  // Fecha menu ao trocar de página no mobile
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-theme-base flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const isAdmin = isAdminEmail(session?.user?.email)

  // Acesso não aprovado (plano expirado, pendente, recusado) não desloga
  // sozinho — só bloqueia o conteúdo com a tela abaixo, mantendo a sessão.
  const isBlocked = status === "authenticated" && !session?.user?.id
  const blockReason = String(session?.user?.accessStatus || "expired")

  const groups = isAdmin
    ? [
        ...navGroups,
        {
          label: "Administração",
          items: [
            { href: "/dashboard/admin", icon: Shield, label: "Painel Admin" },
            { href: "/dashboard/admin/notifications", icon: Bell, label: "Notificações" },
          ],
        },
      ]
    : navGroups

  const Sidebar = ({ collapsed = false, onClose }: { collapsed?: boolean; onClose?: () => void }) => (
    <aside className="flex h-full flex-col overflow-hidden bg-theme-surface border-r border-theme-border">
      <div className={`flex items-center border-b border-theme-border ${collapsed ? "justify-center p-4" : "justify-between p-6"}`}>
        <div className="flex items-center gap-3">
          <img
            src="/logo/logosfundo.png"
            alt="Logo InstaFlow"
            className="h-8 w-8 shrink-0 rounded-lg object-contain"
          />
          {!collapsed && <Wordmark className="whitespace-nowrap font-bold text-theme-text" />}
        </div>
        {!collapsed && onClose && (
          <button onClick={onClose} className="text-theme-text-muted hover:text-theme-text">
            <X size={20} />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto overflow-x-hidden p-4">
        {groups.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <p className="mb-2 whitespace-nowrap px-3 text-[10px] font-semibold uppercase tracking-wider text-theme-text-muted">
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
                        : "text-theme-text-muted hover:bg-theme-surface-2 hover:text-theme-text-secondary"
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

      <div className={`border-t border-theme-border ${collapsed ? "p-3" : "p-4"}`}>
        {session?.user?.id && (
          <div className={collapsed ? "flex justify-center" : "mb-3"}>
            <AccountSwitcher
              collapsed={collapsed}
              user={{
                id: session.user.id,
                email: session.user.email,
                name: session.user.name,
                image: session.user.image,
              }}
            />
          </div>
        )}
        <button
          onClick={() => {
            toast.success("Sessão encerrada.")
            void fetch("/api/auth/logout", { method: "POST" })
              .catch(() => {})
              .then(() => signOut({ callbackUrl: "/login" }))
          }}
          title={collapsed ? "Sair" : undefined}
          className={`flex items-center gap-2 text-xs text-theme-text-muted transition-colors hover:text-theme-text-secondary ${
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
    <div className="min-h-screen bg-theme-base flex">
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
        <div className="flex items-center justify-between px-4 py-3 bg-theme-surface border-b border-theme-border sticky top-0 z-30 md:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="text-theme-text-secondary hover:text-theme-text p-1"
          >
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2">
            <img
              src="/logo/logosfundo.png"
              alt="Logo InstaFlow"
              className="h-7 w-7 rounded-lg object-contain"
            />
            <Wordmark className="font-bold text-theme-text text-sm" />
          </div>
          <div className="w-8" />
        </div>

        <div
          className={`flex-1 p-4 transition-all duration-200 md:p-8 ${
            desktopExpanded ? "md:ml-60" : "md:ml-16"
          }`}
        >
          {isBlocked ? <BlockedAccess reason={blockReason} email={session?.user?.email} /> : children}
        </div>
      </main>

      <AssistantWidget />
    </div>
  )
}

const BLOCK_MESSAGES: Record<string, { title: string; description: string }> = {
  expired: {
    title: "Seu plano expirou",
    description:
      "Renove pra continuar usando o InstaFlow. Assim que o pagamento for confirmado, essa tela libera sozinha — não precisa logar de novo.",
  },
  pending: {
    title: "Conta aguardando aprovação",
    description:
      "Seu acesso ainda está sendo liberado. Assim que for aprovado, essa tela libera sozinha — não precisa logar de novo.",
  },
  rejected: {
    title: "Acesso não aprovado",
    description: "Fale com o suporte do InstaFlow pra entender o que houve com sua conta.",
  },
}

function BlockedAccess({ reason, email }: { reason: string; email?: string | null }) {
  const message = BLOCK_MESSAGES[reason] || BLOCK_MESSAGES.expired

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="max-w-md rounded-2xl border border-theme-border bg-theme-surface p-8 text-center">
        <h1 className="text-lg font-semibold text-theme-text">{message.title}</h1>
        <p className="mt-2 text-sm text-theme-text-muted">{message.description}</p>
        {email && <p className="mt-3 text-xs text-theme-text-muted">Conta: {email}</p>}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <a
            href="/planos"
            className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500"
          >
            Ver planos
          </a>
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg border border-theme-border px-4 py-2 text-sm font-medium text-theme-text-secondary hover:bg-theme-surface-2"
          >
            Já renovei, verificar de novo
          </button>
        </div>
      </div>
    </div>
  )
}
