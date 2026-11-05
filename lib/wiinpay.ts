// Integração com a API de Pix da WiinPay.
//
// A documentação oficial (fornecida pelo usuário em PDF) só cobre:
//   POST /payment/create  — cria uma cobrança Pix
//   GET  /payment/list/{paymentId} — consulta uma cobrança
// Nenhuma das duas páginas mostra o corpo de sucesso (a doc só lista os
// status HTTP), e não existe verificação de assinatura documentada pro
// webhook. Por isso:
//   - extractPaymentId/extractPixCode tentam os nomes de campo mais comuns
//     entre gateways Pix brasileiros; ajuste aqui se a resposta real da
//     WiinPay usar outro nome.
//   - Nunca confiamos no corpo do webhook pra liberar acesso — sempre
//     reconsultamos o pagamento direto na WiinPay (ver lib/pix-orders.ts).
const WIINPAY_BASE_URL = "https://api-v2.wiinpay.com.br"

function requireApiKey() {
  const key = process.env.WIINPAY_API_KEY?.trim()
  if (!key) throw new Error("WIINPAY_API_KEY não configurada no servidor.")
  return key
}

// data.message/data.error podem vir como string, mas também como objeto
// (ex.: erro de validação por campo) ou array — um String(objeto) vira o
// literal "[object Object]", que é o que chegava pro usuário. Aqui sempre
// devolvemos algo legível.
function stringifyApiError(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") return fallback
  const d = data as Record<string, unknown>
  const candidate = d.message ?? d.error ?? d.errors
  if (typeof candidate === "string" && candidate.trim()) return candidate
  if (candidate && typeof candidate === "object") {
    try {
      const text = JSON.stringify(candidate)
      return text && text !== "{}" ? text : fallback
    } catch {
      return fallback
    }
  }
  return fallback
}

type CreatePixPaymentParams = {
  value: number
  name: string
  email: string
  description: string
  webhookUrl: string
  metadata?: Record<string, string>
}

export async function createPixPayment(params: CreatePixPaymentParams) {
  const apiKey = requireApiKey()

  const response = await fetch(`${WIINPAY_BASE_URL}/payment/create`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      value: params.value,
      name: params.name,
      email: params.email,
      description: params.description,
      webhook_url: params.webhookUrl,
      metadata: params.metadata || {},
    }),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    console.error("[wiinpay] Falha ao criar pagamento", response.status, JSON.stringify(data))
    throw new Error(
      stringifyApiError(data, `WiinPay respondeu ${response.status} ao criar o pagamento.`)
    )
  }

  return data as Record<string, unknown>
}

export async function getPixPayment(paymentId: string) {
  const apiKey = requireApiKey()

  const response = await fetch(
    `${WIINPAY_BASE_URL}/payment/list/${encodeURIComponent(paymentId)}`,
    {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
    }
  )

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    console.error("[wiinpay] Falha ao consultar pagamento", response.status, JSON.stringify(data))
    throw new Error(
      stringifyApiError(data, `WiinPay respondeu ${response.status} ao consultar o pagamento.`)
    )
  }

  return data as Record<string, unknown>
}

function unwrap(data: Record<string, unknown>): Record<string, unknown> {
  return (data.data as Record<string, unknown>) || data
}

export function extractPaymentId(data: Record<string, unknown>): string | null {
  const d = unwrap(data)
  const value = d.id ?? d.payment_id ?? d.paymentId ?? d.transaction_id
  return value ? String(value) : null
}

export function extractPixCode(data: Record<string, unknown>): string | null {
  const d = unwrap(data)
  const value =
    d.qr_code ?? d.pix_qr_code ?? d.pix_code ?? d.copy_paste ?? d.copia_e_cola ?? d.emv ?? d.brcode ?? d.code
  return value ? String(value) : null
}

export function extractStatus(data: Record<string, unknown>): string | null {
  const d = unwrap(data)
  const value = d.status ?? d.payment_status
  return value ? String(value) : null
}

// A doc dizia "paid" minúsculo; a WiinPay passou a mandar "PAID" maiúsculo
// no webhook — comparamos sem diferenciar maiúsculo/minúsculo.
export function isPaidStatus(status: string | null) {
  if (!status) return false
  const normalized = status.trim().toUpperCase()
  return ["PAID", "PAGO", "CONFIRMED", "APPROVED", "COMPLETED"].includes(normalized)
}
