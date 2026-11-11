// Lista de contas do InstaFlow "salvas" nesse navegador — guardada só em
// localStorage (nunca sai daqui), pra permitir trocar de conta sem logar de
// novo. Cada entrada guarda um token assinado (ver lib/account-switch.ts)
// que o servidor troca por uma sessão nova daquela conta.

const STORAGE_KEY = "instaflow:saved-accounts"

export type SavedAccount = {
  userId: string
  email: string
  name: string | null
  image: string | null
  switchToken: string
  savedAt: number
}

export function getSavedAccounts(): SavedAccount[] {
  if (typeof window === "undefined") return []

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function setSavedAccounts(accounts: SavedAccount[]) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts))
  } catch {
    // localStorage indisponível (modo privado, etc.) — sem lista salva, sem quebrar nada
  }
}

export function upsertSavedAccount(account: Omit<SavedAccount, "savedAt">) {
  const current = getSavedAccounts().filter((a) => a.userId !== account.userId)
  current.push({ ...account, savedAt: Date.now() })
  setSavedAccounts(current)
}

export function removeSavedAccount(userId: string) {
  setSavedAccounts(getSavedAccounts().filter((a) => a.userId !== userId))
}

export async function switchToAccount(switchToken: string) {
  const response = await fetch("/api/auth/switch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: switchToken }),
  })
  return response.ok
}

export async function mintSwitchTokenForCurrentUser(): Promise<string | null> {
  const response = await fetch("/api/auth/switch-token", { method: "POST" })
  if (!response.ok) return null
  const data = await response.json().catch(() => null)
  return typeof data?.token === "string" ? data.token : null
}
