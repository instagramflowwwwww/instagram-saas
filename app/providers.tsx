"use client"

import { SessionProvider } from "next-auth/react"
import { Toaster } from "react-hot-toast"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchInterval={60} refetchOnWindowFocus>
      {children}
      <Toaster
        position="top-center"
        reverseOrder={false}
        gutter={10}
        toastOptions={{
          duration: 4200,
          style: {
            background: "#161616",
            color: "#f5f5f5",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: "12px",
            boxShadow: "0 18px 45px rgba(0,0,0,0.45)",
            fontSize: "14px",
            maxWidth: "430px",
          },
          success: {
            duration: 3600,
            iconTheme: {
              primary: "#4ade80",
              secondary: "#161616",
            },
          },
          error: {
            duration: 5200,
            iconTheme: {
              primary: "#f87171",
              secondary: "#161616",
            },
          },
          loading: {
            duration: Infinity,
          },
        }}
      />
    </SessionProvider>
  )
}
