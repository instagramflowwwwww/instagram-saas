import chromium from "@sparticuz/chromium"
import { authenticator } from "otplib"
import { chromium as playwrightChromium, type Cookie } from "playwright-core"

// Automação de navegador para a "API não oficial": login direto com
// usuário/senha do Instagram (sem OAuth) só pra aceitar convite de
// testador de App Meta. Isolado de propósito do fluxo oficial — não
// compartilha token, conta nem lógica com lib/instagram-publisher.ts.
//
// Aviso: automatizar login fora da API oficial viola os Termos de Uso do
// Instagram e aumenta o risco de a conta ser sinalizada/bloqueada pelos
// sistemas antifraude da Meta, especialmente sem um proxy residencial por
// conta. Os seletores usados aqui refletem a interface do Instagram no
// momento da escrita — a Meta muda essa interface com frequência, então é
// esperado que precisem de ajuste depois do primeiro teste real.

export type UnofficialLoginResult =
  | { status: "logged_in"; cookies: Cookie[] }
  | { status: "checkpoint_required"; message: string }
  | { status: "failed"; message: string }

// pnpm guarda os pacotes num store com symlinks, e o output file tracing da
// Vercel não consegue empacotar o binário do Chromium (~60MB) através
// desses links — por isso apontamos para o pack oficial no GitHub Releases
// em vez de tentar incluir o arquivo no bundle da função. No cold start ele
// baixa uma vez pra /tmp e reaproveita nas próximas chamadas "quentes".
const CHROMIUM_PACK_URL =
  "https://github.com/Sparticuz/chromium/releases/download/v143.0.4/chromium-v143.0.4-pack.x64.tar"

async function launchBrowser(proxyUrl?: string | null) {
  const executablePath = await chromium.executablePath(CHROMIUM_PACK_URL)
  return playwrightChromium.launch({
    executablePath,
    args: chromium.args,
    headless: true,
    proxy: proxyUrl ? { server: proxyUrl } : undefined,
  })
}

async function dismissPostLoginDialogs(page: import("playwright-core").Page) {
  // "Salvar informações de login?" e "Ativar notificações?" — ambos com
  // texto variável por idioma da conta, por isso o match é amplo.
  for (const pattern of [/agora não/i, /not now/i, /ahora no/i]) {
    try {
      const button = page.getByRole("button", { name: pattern }).first()
      await button.waitFor({ timeout: 4000 })
      await button.click()
      await page.waitForTimeout(500)
    } catch {
      // botão não apareceu — segue o fluxo normalmente
    }
  }
}

export async function loginToInstagram(params: {
  username: string
  password: string
  totpSecret?: string | null
  proxyUrl?: string | null
}): Promise<UnofficialLoginResult> {
  const browser = await launchBrowser(params.proxyUrl)

  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 800 },
    })
    const page = await context.newPage()

    await page.goto("https://www.instagram.com/accounts/login/", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    })

    await page.locator('input[name="username"]').fill(params.username)
    await page.locator('input[name="password"]').fill(params.password)
    await page.locator('button[type="submit"]').click()

    // Espera qualquer um dos três destinos possíveis depois do submit.
    const outcome = await Promise.race([
      page
        .waitForURL(/instagram\.com\/(?!accounts\/login)/, { timeout: 20000 })
        .then(() => "navigated" as const)
        .catch(() => null),
      page
        .locator('input[name="verificationCode"]')
        .waitFor({ timeout: 20000 })
        .then(() => "two_factor" as const)
        .catch(() => null),
      page
        .getByText(/atividade suspeita|suspicious login|confirme que é você|we detected an unusual/i)
        .first()
        .waitFor({ timeout: 20000 })
        .then(() => "checkpoint" as const)
        .catch(() => null),
    ])

    if (outcome === "two_factor") {
      if (!params.totpSecret) {
        return {
          status: "checkpoint_required",
          message: "A conta pediu código de autenticação de dois fatores, mas nenhum segredo TOTP foi cadastrado.",
        }
      }
      const code = authenticator.generate(params.totpSecret)
      await page.locator('input[name="verificationCode"]').fill(code)
      await page.getByRole("button", { name: /confirmar|confirm/i }).click()

      const confirmed = await page
        .waitForURL(/instagram\.com\/(?!accounts\/login)/, { timeout: 20000 })
        .then(() => true)
        .catch(() => false)

      if (!confirmed) {
        return {
          status: "checkpoint_required",
          message: "Código de dois fatores enviado, mas o Instagram não liberou o acesso (possível checkpoint adicional).",
        }
      }
    } else if (outcome === "checkpoint") {
      return {
        status: "checkpoint_required",
        message: "O Instagram pediu verificação manual (checkpoint) para este login — não dá pra continuar automaticamente.",
      }
    } else if (outcome === null) {
      return {
        status: "failed",
        message: "O Instagram não respondeu como esperado ao login (usuário/senha incorretos ou página mudou).",
      }
    }

    await dismissPostLoginDialogs(page)
    const cookies = await context.cookies()

    return { status: "logged_in", cookies }
  } catch (error) {
    return {
      status: "failed",
      message: error instanceof Error ? error.message : "Erro desconhecido no login.",
    }
  } finally {
    await browser.close().catch(() => {})
  }
}

export type AcceptInviteResult =
  | { status: "invite_accepted" }
  | { status: "no_invite_found" }
  | { status: "failed"; message: string }

export async function acceptTesterInvite(params: {
  cookies: Cookie[]
  proxyUrl?: string | null
}): Promise<AcceptInviteResult> {
  const browser = await launchBrowser(params.proxyUrl)

  try {
    const context = await browser.newContext()
    await context.addCookies(params.cookies)
    const page = await context.newPage()

    // Caminho: Instagram > Configurações > Apps e sites > Convites de
    // testador. A URL e os textos abaixo são o melhor palpite com base na
    // interface atual — validar no primeiro teste real e ajustar aqui se
    // a Meta tiver mudado o layout.
    await page.goto("https://www.instagram.com/accounts/manage_access/", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    })

    const inviteTab = page.getByText(/convites de testador|tester invites/i).first()
    if (await inviteTab.isVisible({ timeout: 8000 }).catch(() => false)) {
      await inviteTab.click()
    }

    const acceptButton = page.getByRole("button", { name: /aceitar|accept/i }).first()
    const hasInvite = await acceptButton.isVisible({ timeout: 8000 }).catch(() => false)

    if (!hasInvite) {
      return { status: "no_invite_found" }
    }

    await acceptButton.click()
    await page.waitForTimeout(1500)

    return { status: "invite_accepted" }
  } catch (error) {
    return {
      status: "failed",
      message: error instanceof Error ? error.message : "Erro desconhecido ao aceitar o convite.",
    }
  } finally {
    await browser.close().catch(() => {})
  }
}
