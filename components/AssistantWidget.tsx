"use client"

import { useEffect, useRef, useState } from "react"
import { Bot, Loader2, Send, Sparkles, X } from "lucide-react"

type ChatMessage = { role: "user" | "assistant"; content: string }

const GREETING: ChatMessage = {
  role: "assistant",
  content:
    "Oi! Sou o assistente do InstaFlow. 👋 Posso te ajudar a entender qualquer parte do painel — automação, biblioteca, contas, performance, App Meta, o que precisar. Manda sua dúvida.",
}

export function AssistantWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, loading])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const send = async () => {
    const content = input.trim()
    if (!content || loading) return

    const nextMessages = [...messages, { role: "user" as const, content }]
    setMessages(nextMessages)
    setInput("")
    setLoading(true)

    try {
      const response = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.error || "Não foi possível responder agora.")
      }

      setMessages((current) => [...current, { role: "assistant", content: data.reply }])
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content:
            error instanceof Error
              ? error.message
              : "Não foi possível responder agora. Tente de novo em instantes.",
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      void send()
    }
  }

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-5 z-50 flex h-[30rem] w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#111] shadow-2xl shadow-black/50 sm:right-6">
          <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] bg-gradient-to-r from-purple-500/15 via-pink-500/10 to-transparent px-4 py-3.5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 text-white shadow-[0_0_14px_-2px_rgba(192,132,252,0.6)]">
                <Sparkles size={15} />
              </span>
              <div>
                <p className="text-sm font-semibold text-white">Assistente InstaFlow</p>
                <p className="flex items-center gap-1 text-[10px] text-gray-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                  Online
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

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                    message.role === "user"
                      ? "rounded-br-sm bg-gradient-to-br from-purple-600 to-pink-600 text-white"
                      : "rounded-bl-sm border border-white/[0.06] bg-white/[0.03] text-gray-200"
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm border border-white/[0.06] bg-white/[0.03] px-3.5 py-3">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-500 [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-500 [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-500" />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-end gap-2 border-t border-white/[0.06] p-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pergunte alguma coisa sobre o painel..."
              rows={1}
              className="max-h-24 flex-1 resize-none rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs text-white placeholder-gray-600 focus:border-purple-500 focus:outline-none"
            />
            <button
              onClick={() => void send()}
              disabled={loading || !input.trim()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 text-white transition-opacity disabled:opacity-40"
              aria-label="Enviar mensagem"
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? "Fechar assistente" : "Abrir assistente InstaFlow"}
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-purple-600 to-pink-600 text-white shadow-[0_8px_24px_-6px_rgba(192,132,252,0.6)] transition-transform hover:scale-105 sm:right-6"
      >
        {!open && (
          <span className="absolute inset-0 rounded-full bg-purple-500/60 animate-ping" />
        )}
        <span className="relative">
          {open ? <X size={22} /> : <Bot size={22} />}
        </span>
      </button>
    </>
  )
}
