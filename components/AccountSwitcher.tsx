"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import toast from "react-hot-toast"
import { ChevronsUpDown, Plus, X, Check } from "lucide-react"
import {
  getSavedAccounts,
  upsertSavedAccount,
  removeSavedAccount,
  switchToAccount,
  mintSwitchTokenForCurrentUser,
  type SavedAccount,
} from "@/lib/account-switch-client"

// Refresca o token salvo no máximo 1x por dia — não precisa gerar um novo a
// cada carregamento de página, o antigo ainda é válido.
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000

type CurrentUser = {
  id: string
  email: string | null | undefined
  name: string | null | undefined
  image: string | null | undefined
}

export function AccountSwitcher({
  user,
  collapsed,
}: {
  user: CurrentUser
  collapsed?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [accounts, setAccounts] = useState<SavedAccount[]>([])
  const [switching, setSwitching] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setAccounts(getSavedAccounts())
  }, [])

  useEffect(() => {
    if (!user.id) return

    const existing = getSavedAccounts().find((a) => a.userId === user.id)
    const isStale = !existing || Date.now() - existing.savedAt > REFRESH_INTERVAL_MS

    if (!isStale) return

    let cancelled = false
    mintSwitchTokenForCurrentUser().then((token) => {
      if (cancelled || !token) return
      upsertSavedAccount({
        userId: user.id,
        email: user.email || "",
        name: user.name || null,
        image: user.image || null,
        switchToken: token,
      })
      setAccounts(getSavedAccounts())
    })

    return () => {
      cancelled = true
    }
  }, [user.id, user.email, user.name, user.image])

  useEffect(() => {
    if (!open) return

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [open])

  async function handleSwitch(account: SavedAccount) {
    if (account.userId === user.id) {
      setOpen(false)
      return
    }

    setSwitching(account.userId)
    const ok = await switchToAccount(account.switchToken)

    if (!ok) {
      setSwitching(null)
      toast.error("Essa conta não está mais disponível. Remova e adicione de novo.")
      return
    }

    window.location.href = "/dashboard"
  }

  function handleRemove(event: React.MouseEvent, userId: string) {
    event.stopPropagation()
    removeSavedAccount(userId)
    setAccounts(getSavedAccounts())
  }

  const otherAccounts = accounts.filter((a) => a.userId !== user.id)

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title={collapsed ? "Trocar de conta" : undefined}
        className={`flex w-full items-center gap-3 rounded-lg transition-colors hover:bg-theme-surface-2 ${
          collapsed ? "justify-center p-1.5" : "p-1.5"
        }`}
      >
        {user.image ? (
          <img src={user.image} alt="" className="h-8 w-8 shrink-0 rounded-full" />
        ) : (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-500/20 text-xs font-semibold text-purple-300">
            {(user.name || user.email || "?").slice(0, 1).toUpperCase()}
          </div>
        )}
        {!collapsed && (
          <>
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-sm font-medium text-theme-text">{user.name}</p>
              <p className="truncate text-xs text-theme-text-muted">{user.email}</p>
            </div>
            <ChevronsUpDown size={14} className="shrink-0 text-theme-text-muted" />
          </>
        )}
      </button>

      {open && (
        <div
          className={`absolute z-50 w-64 rounded-lg border border-theme-border bg-theme-surface p-1.5 shadow-xl ${
            collapsed ? "bottom-0 left-full ml-2" : "bottom-full left-0 mb-2"
          }`}
        >
          <p className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-theme-text-muted">
            Contas do InstaFlow
          </p>

          <div className="space-y-0.5">
            <AccountRow
              account={{
                userId: user.id,
                email: user.email || "",
                name: user.name || null,
                image: user.image || null,
                switchToken: "",
                savedAt: 0,
              }}
              isCurrent
              busy={false}
              onSwitch={() => setOpen(false)}
            />
            {otherAccounts.map((account) => (
              <AccountRow
                key={account.userId}
                account={account}
                isCurrent={false}
                busy={switching === account.userId}
                onSwitch={() => handleSwitch(account)}
                onRemove={(e) => handleRemove(e, account.userId)}
              />
            ))}
          </div>

          <Link
            href="/login"
            onClick={() => setOpen(false)}
            className="mt-1 flex items-center gap-2 rounded-md px-2 py-2 text-xs font-medium text-purple-400 hover:bg-theme-surface-2"
          >
            <Plus size={14} />
            Adicionar outra conta
          </Link>
        </div>
      )}
    </div>
  )
}

function AccountRow({
  account,
  isCurrent,
  busy,
  onSwitch,
  onRemove,
}: {
  account: SavedAccount
  isCurrent: boolean
  busy: boolean
  onSwitch: () => void
  onRemove?: (event: React.MouseEvent) => void
}) {
  return (
    <div className="group flex items-center gap-1 rounded-md hover:bg-theme-surface-2">
      <button
        onClick={onSwitch}
        disabled={busy}
        className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left disabled:opacity-50"
      >
        {account.image ? (
          <img src={account.image} alt="" className="h-6 w-6 shrink-0 rounded-full" />
        ) : (
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-500/20 text-[10px] font-semibold text-purple-300">
            {(account.name || account.email || "?").slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-theme-text">{account.name || account.email}</p>
          <p className="truncate text-[11px] text-theme-text-muted">
            {busy ? "Entrando…" : account.email}
          </p>
        </div>
        {isCurrent && <Check size={13} className="shrink-0 text-purple-400" />}
      </button>
      {!isCurrent && onRemove && (
        <button
          onClick={onRemove}
          title="Remover da lista"
          className="shrink-0 p-1.5 text-theme-text-muted opacity-0 transition-opacity hover:text-theme-text group-hover:opacity-100"
        >
          <X size={12} />
        </button>
      )}
    </div>
  )
}
