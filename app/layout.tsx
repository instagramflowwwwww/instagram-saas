import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Providers } from "./providers"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "InstaFlow — Automação de Instagram",
  description: "Gerencie e publique em múltiplas contas do Instagram",
  icons: {
    icon: "/logo/logosfundo.png",
    shortcut: "/logo/logosfundo.png",
    apple: "/logo/logosfundo.png",
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
