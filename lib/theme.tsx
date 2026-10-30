"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"

export type ThemePreference = "light" | "dark" | "system"

const STORAGE_KEY = "instaflow-theme"

type ThemeContextValue = {
  preference: ThemePreference
  resolved: "light" | "dark"
  setPreference: (value: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function getSystemPrefersDark() {
  if (typeof window === "undefined") return true
  return window.matchMedia("(prefers-color-scheme: dark)").matches
}

function applyTheme(resolved: "light" | "dark") {
  const root = document.documentElement
  root.classList.toggle("dark", resolved === "dark")
  root.style.colorScheme = resolved
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // O valor inicial real já foi aplicado pelo script inline no <head> antes
  // da hidratação (evita o "flash" de tema errado) — aqui só sincroniza o
  // estado do React com o que já está no DOM.
  const [preference, setPreferenceState] = useState<ThemePreference>("dark")
  const [resolved, setResolved] = useState<"light" | "dark">("dark")

  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as ThemePreference | null) || "dark"
    setPreferenceState(stored)
    setResolved(stored === "system" ? (getSystemPrefersDark() ? "dark" : "light") : stored)
  }, [])

  useEffect(() => {
    if (preference !== "system") return
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const handleChange = () => {
      const next = media.matches ? "dark" : "light"
      setResolved(next)
      applyTheme(next)
    }
    media.addEventListener("change", handleChange)
    return () => media.removeEventListener("change", handleChange)
  }, [preference])

  const setPreference = useCallback((value: ThemePreference) => {
    setPreferenceState(value)
    localStorage.setItem(STORAGE_KEY, value)
    const next = value === "system" ? (getSystemPrefersDark() ? "dark" : "light") : value
    setResolved(next)
    applyTheme(next)
  }, [])

  return (
    <ThemeContext.Provider value={{ preference, resolved, setPreference }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error("useTheme precisa estar dentro de <ThemeProvider>")
  return context
}

// Roda antes da hidratação (injetado como <script> inline no <head>), pra
// aplicar o tema certo no primeiro paint e não dar aquele flash de tema
// errado trocando logo em seguida.
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('${STORAGE_KEY}') || 'dark';
    var dark = stored === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : stored === 'dark';
    var root = document.documentElement;
    root.classList.toggle('dark', dark);
    root.style.colorScheme = dark ? 'dark' : 'light';
  } catch (e) {}
})();
`
