"use client"

import { useState } from "react"
import { Bot, Sparkles, X } from "lucide-react"

export function AssistantWidget() {
  const [open, setOpen] = useState(false)

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-5 z-50 flex w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d10] shadow-2xl shadow-black/50 sm:right-6">
          <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] bg-gradient-to-r from-purple-500/15 via-pink-500/10 to-transparent px-4 py-3.5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 text-white shadow-[0_0_14px_-2px_rgba(192,132,252,0.6)]">
                <Sparkles size={15} />
              </span>
              <div>
                <p className="text-sm font-semibold text-white">Assistente InstaFlow</p>
                <p className="flex items-center gap-1 text-[10px] text-gray-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  Em breve
                </p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Fechar assistente"
              className="rounded-lg p-1.5 text-gray-500 hover:bg-white/[0.06] hover:text-white"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-500/10">
              <Bot size={22} className="text-purple-400" />
            </span>
            <p className="text-sm font-medium text-white">O assistente de IA está a caminho</p>
            <p className="text-xs leading-relaxed text-gray-500">
              Em breve você vai poder tirar dúvidas sobre qualquer parte do painel direto por aqui.
            </p>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? "Fechar assistente" : "Abrir assistente InstaFlow"}
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-purple-600 to-pink-600 text-white shadow-[0_8px_24px_-6px_rgba(192,132,252,0.6)] transition-transform hover:scale-105 sm:right-6"
      >
        <span className="relative">
          {open ? <X size={22} /> : <Bot size={22} />}
        </span>
      </button>
    </>
  )
}
