"use client"

// Tudo aqui roda só no navegador: Notification, ServiceWorkerRegistration e
// PushManager não existem no lado do servidor.

export function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  )
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = atob(base64)
  return Uint8Array.from(rawData, (char) => char.charCodeAt(0))
}

export async function getCurrentPushSubscription() {
  if (!isPushSupported()) return null
  const registration = await navigator.serviceWorker.ready
  return registration.pushManager.getSubscription()
}

export async function enablePush(vapidPublicKey: string) {
  if (!isPushSupported()) {
    throw new Error("Este navegador não suporta notificações push.")
  }

  const permission = await Notification.requestPermission()
  if (permission !== "granted") {
    throw new Error("Permissão de notificação negada.")
  }

  const registration = await navigator.serviceWorker.ready
  const subscription =
    (await registration.pushManager.getSubscription()) ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    }))

  const response = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  })
  if (!response.ok) throw new Error("Não foi possível salvar a inscrição no servidor.")

  return subscription
}

export async function disablePush() {
  const subscription = await getCurrentPushSubscription()
  if (!subscription) return

  await fetch("/api/push/subscribe", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  }).catch(() => {})

  await subscription.unsubscribe()
}
