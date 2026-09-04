export const ADMIN_EMAILS = ["jfontesdacunha@gmail.com", "biel2@gmail.com"]

export const ACCESS_PLANS = {
  vip: {
    id: "vip",
    label: "VIP",
    days: 15,
  },
  premium: {
    id: "premium",
    label: "Premium",
    days: 30,
  },
} as const

export type AccessPlanId = keyof typeof ACCESS_PLANS
export type AccessStatus = "pending" | "approved" | "rejected" | "expired"

type UserAccess = {
  email?: string | null
  accessStatus?: string | null
  accessExpiresAt?: Date | string | null
}

export function isAdminEmail(email?: string | null) {
  if (!email) return false
  const normalized = email.toLowerCase()
  return ADMIN_EMAILS.some((adminEmail) => adminEmail.toLowerCase() === normalized)
}

export function getEffectiveAccessStatus(user: UserAccess): AccessStatus {
  if (isAdminEmail(user.email)) return "approved"

  const status = String(user.accessStatus || "approved") as AccessStatus
  const expiresAt = user.accessExpiresAt
    ? new Date(user.accessExpiresAt).getTime()
    : null

  if (status === "approved" && expiresAt && expiresAt <= Date.now()) {
    return "expired"
  }

  if (["pending", "approved", "rejected", "expired"].includes(status)) {
    return status
  }

  return "pending"
}

export function canAccessPlatform(user: UserAccess) {
  return getEffectiveAccessStatus(user) === "approved"
}

export function getPlan(planId: unknown) {
  const key = String(planId || "") as AccessPlanId
  return ACCESS_PLANS[key] || null
}

export function addPlanDays(baseDate: Date, days: number) {
  return new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000)
}
