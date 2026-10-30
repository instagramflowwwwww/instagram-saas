import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Providers } from "./providers"
import { THEME_INIT_SCRIPT } from "@/lib/theme"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "InstaFlow — Automação de Instagram",
  description: "Gerencie e publique em múltiplas contas do Instagram",
  manifest: "/manifest.json",
  icons: {
    icon: "/logo/logosfundo.png",
    shortcut: "/logo/logosfundo.png",
    apple: "/icons/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "InstaFlow",
  },
}

export const viewport = {
  themeColor: "#0a0a0a",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className={inter.className} suppressHydrationWarning>
        <Providers>{children}</Providers>
        <script
          // Registra o service worker de push assim que a página carrega.
          // Fica fora de um componente React para não depender de hydration
          // e não atrasar o primeiro render.
          dangerouslySetInnerHTML={{
            __html: `
              if ("serviceWorker" in navigator) {
                window.addEventListener("load", function () {
                  navigator.serviceWorker.register("/sw.js").catch(function () {})
                })
              }
            `,
          }}
        />
      </body>
    </html>
  )
}
