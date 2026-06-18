"use client"

import { useEffect, useRef, useState } from "react"
import { Send, Stethoscope } from "lucide-react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"

// Theme-matched renderers so the assistant can reply with tables, bold text and
// lists (e.g. invoice details as a table) instead of raw markdown.
const markdownComponents: Components = {
  p: ({ children }) => <p className="whitespace-pre-wrap mb-2 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
  ul: ({ children }) => <ul className="list-disc pl-4 my-2 space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-4 my-2 space-y-0.5">{children}</ol>,
  a: ({ children, href }) => (
    <a href={href} className="text-[#8AB4F8] underline" target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto my-2 rounded-lg border border-white/10">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-white/[0.06]">{children}</thead>,
  th: ({ children }) => (
    <th className="border-b border-white/10 px-3 py-2 text-left font-semibold text-[#EDEDEF]">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-white/[0.06] px-3 py-2 align-top">{children}</td>
  ),
}

interface ChatMessage {
  role: "user" | "assistant"
  content: string
  timestamp: string
}

const WELCOME: ChatMessage = {
  role: "assistant",
  content:
    "Hello! 👋 Welcome to Dr Tooth Dental Clinic. I'm your virtual receptionist. I can help you book an appointment, reschedule or cancel one, check your appointments, or check your bill. How can I help you today?",
  timestamp: new Date().toISOString(),
}

export default function ChatPage() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Initialize session id and load history
  useEffect(() => {
    let id = localStorage.getItem("dr_tooth_chat_session")
    if (!id) {
      id = "chat_" + crypto.randomUUID()
      localStorage.setItem("dr_tooth_chat_session", id)
    }
    setSessionId(id)

    async function loadHistory(sid: string) {
      try {
        const res = await fetch(`/api/chat?sessionId=${encodeURIComponent(sid)}`)
        if (res.ok) {
          const data = await res.json()
          if (Array.isArray(data.messages) && data.messages.length > 0) {
            setMessages([WELCOME, ...data.messages])
          }
        }
      } catch {
        // ignore — start fresh with welcome message
      }
    }
    loadHistory(id)
  }, [])

  // Auto-scroll to newest message
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, sending])

  async function handleSend() {
    const text = input.trim()
    if (!text || sending || !sessionId) return

    const userMsg: ChatMessage = {
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMsg])
    setInput("")
    setSending(true)

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: text }),
      })
      const data = await res.json()
      const reply =
        data.reply ?? "Sorry, I'm having trouble right now. Please try again or call the clinic."
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: reply, timestamp: new Date().toISOString() },
      ])
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I couldn't reach the clinic right now. Please try again shortly.",
          timestamp: new Date().toISOString(),
        },
      ])
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0c]">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06] bg-[#0a0a0c]/80 backdrop-blur-sm">
        <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-[#5E6AD2]/10 border border-[#5E6AD2]/20">
          <Stethoscope className="h-5 w-5 text-[#5E6AD2]" />
        </div>
        <div>
          <h1 className="text-base font-semibold text-[#EDEDEF] leading-tight">
            Dr Tooth Dental Clinic
          </h1>
          <p className="text-xs text-[#8A8F98] flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
            Virtual Receptionist · Online
          </p>
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-2xl mx-auto space-y-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-[#5E6AD2] text-white rounded-tr-sm"
                    : "bg-white/[0.06] text-[#EDEDEF] rounded-tl-sm"
                }`}
              >
                {msg.role === "user" ? (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                ) : (
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                    {msg.content}
                  </ReactMarkdown>
                )}
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex justify-start">
              <div className="bg-white/[0.06] rounded-2xl rounded-tl-sm px-4 py-3">
                <div className="flex gap-1">
                  <span className="h-2 w-2 rounded-full bg-[#8A8F98] animate-bounce [animation-delay:-0.3s]" />
                  <span className="h-2 w-2 rounded-full bg-[#8A8F98] animate-bounce [animation-delay:-0.15s]" />
                  <span className="h-2 w-2 rounded-full bg-[#8A8F98] animate-bounce" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-white/[0.06] bg-[#0a0a0c] px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message…"
            rows={1}
            className="flex-1 resize-none rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-3 text-sm text-[#EDEDEF] placeholder:text-[#8A8F98] focus:outline-none focus:border-[#5E6AD2]/50 max-h-32"
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="flex items-center justify-center h-11 w-11 rounded-xl bg-[#5E6AD2] text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#5E6AD2]/90 transition-colors shrink-0"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
        <p className="max-w-2xl mx-auto text-[10px] text-[#8A8F98] mt-2 text-center">
          AI assistant — for emergencies, please call the clinic directly.
        </p>
      </div>
    </div>
  )
}
