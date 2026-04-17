"use client"
import { useState, useRef, useEffect } from "react"
import { usePathname } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"

interface Message {
  role: "user" | "assistant"
  content: string
}

// Simple markdown-ish renderer: bold, bullet points, line breaks
function RenderText({ text }: { text: string }) {
  const lines = text.split("\n")
  return (
    <div style={{ lineHeight: 1.55 }}>
      {lines.map((line, i) => {
        // Bold **text**
        const parts = line.split(/\*\*(.*?)\*\*/g)
        const rendered = parts.map((part, j) =>
          j % 2 === 1 ? <strong key={j}>{part}</strong> : <span key={j}>{part}</span>
        )
        // Bullet
        if (line.trimStart().startsWith("- ") || line.trimStart().startsWith("• ")) {
          return (
            <div key={i} style={{ display: "flex", gap: 6, marginBottom: 2 }}>
              <span style={{ flexShrink: 0, color: "#94a3b8" }}>•</span>
              <span>{rendered}</span>
            </div>
          )
        }
        return (
          <div key={i} style={{ marginBottom: line === "" ? 6 : 2 }}>
            {rendered}
          </div>
        )
      })}
    </div>
  )
}

export default function ChatWidget() {
  const pathname = usePathname()
  const [open, setOpen]         = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput]       = useState("")
  const [loading, setLoading]   = useState(false)
  const [authed, setAuthed]     = useState(false)
  const bottomRef               = useRef<HTMLDivElement>(null)
  const inputRef                = useRef<HTMLTextAreaElement>(null)

  // Check auth — only show widget for logged-in users
  useEffect(() => {
    const sb = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    sb.auth.getUser().then(({ data }) => setAuthed(!!data.user))
  }, [])

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  // Focus input when panel opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100)
  }, [open])

  // Hide on login page or if not authenticated
  const isLoginPage = pathname === "/login" || pathname === "/auth"
  if (!authed || isLoginPage) return null

  async function sendMessage() {
    const text = input.trim()
    if (!text || loading) return

    const userMsg: Message = { role: "user", content: text }
    setMessages(prev => [...prev, userMsg])
    setInput("")
    setLoading(true)

    try {
      const res  = await fetch("/api/chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ message: text }),
      })
      const data = await res.json() as { reply?: string; error?: string }
      const reply = data.reply ?? (data.error ? `⚠️ ${data.error}` : "Keine Antwort erhalten.")
      setMessages(prev => [...prev, { role: "assistant", content: reply }])
    } catch {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "⚠️ Verbindungsfehler. Bitte versuche es erneut.",
      }])
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <>
      {/* ── Floating trigger button ── */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="PKV-Assistent öffnen"
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          zIndex: 9000,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 18px",
          background: open ? "#1e293b" : "linear-gradient(135deg, #1e40af, #1d4ed8)",
          color: "white",
          border: "none",
          borderRadius: 999,
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
          boxShadow: "0 4px 20px rgba(29,78,216,0.4)",
          transition: "all 0.2s",
          letterSpacing: "0.01em",
        }}
      >
        {open ? (
          <>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            Schließen
          </>
        ) : (
          <>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M14 2H2C1.45 2 1 2.45 1 3v8c0 .55.45 1 1 1h2v2.5l3-2.5H14c.55 0 1-.45 1-1V3c0-.55-.45-1-1-1z" fill="white"/>
            </svg>
            PKV-Assistent
          </>
        )}
      </button>

      {/* ── Chat panel ── */}
      {open && (
        <div
          style={{
            position:     "fixed",
            bottom:       80,
            right:        24,
            zIndex:       8999,
            width:        "min(420px, calc(100vw - 32px))",
            height:       "min(560px, calc(100vh - 120px))",
            background:   "white",
            borderRadius: 16,
            boxShadow:    "0 8px 40px rgba(0,0,0,0.18)",
            display:      "flex",
            flexDirection: "column",
            overflow:     "hidden",
            border:       "1px solid #e2e8f0",
          }}
        >
          {/* Header */}
          <div style={{
            background:     "linear-gradient(135deg, #1e3a8a, #1d4ed8)",
            padding:        "14px 18px",
            color:          "white",
            flexShrink:     0,
          }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>🏥 PKV-Assistent</div>
            <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>
              Kennt deine Rechnungen, Bescheide & Widersprüche
            </div>
          </div>

          {/* Messages */}
          <div style={{
            flex:       1,
            overflowY:  "auto",
            padding:    "14px 16px",
            display:    "flex",
            flexDirection: "column",
            gap:        10,
          }}>
            {messages.length === 0 && (
              <div style={{
                textAlign:  "center",
                color:      "#94a3b8",
                fontSize:   12,
                padding:    "24px 12px",
                lineHeight: 1.6,
              }}>
                Stell mir Fragen zu deinen Rechnungen,<br/>
                Kassenbescheiden oder Widersprüchen.<br/><br/>
                <span style={{ color: "#cbd5e1" }}>Beispiele:</span><br/>
                <em>"Was ist noch offen?"</em><br/>
                <em>"Warum wurde mein Labor abgelehnt?"</em><br/>
                <em>"Was sollte ich als nächstes tun?"</em>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  display:       "flex",
                  justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                }}
              >
                <div style={{
                  maxWidth:     "88%",
                  padding:      "9px 13px",
                  borderRadius: msg.role === "user"
                    ? "14px 14px 4px 14px"
                    : "14px 14px 14px 4px",
                  background:   msg.role === "user" ? "#1d4ed8" : "#f1f5f9",
                  color:        msg.role === "user" ? "white"    : "#1e293b",
                  fontSize:     13,
                }}>
                  {msg.role === "assistant"
                    ? <RenderText text={msg.content} />
                    : <span style={{ whiteSpace: "pre-wrap" }}>{msg.content}</span>
                  }
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div style={{
                  padding:      "9px 14px",
                  borderRadius: "14px 14px 14px 4px",
                  background:   "#f1f5f9",
                  display:      "flex",
                  gap:          4,
                  alignItems:   "center",
                }}>
                  {[0, 1, 2].map(n => (
                    <span
                      key={n}
                      style={{
                        width:            7,
                        height:           7,
                        borderRadius:     "50%",
                        background:       "#94a3b8",
                        display:          "inline-block",
                        animation:        "chatBounce 1.2s infinite",
                        animationDelay:   `${n * 0.2}s`,
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input area */}
          <div style={{
            padding:     "10px 12px",
            borderTop:   "1px solid #e2e8f0",
            background:  "#fafafa",
            flexShrink:  0,
            display:     "flex",
            gap:         8,
            alignItems:  "flex-end",
          }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Frag mich etwas... (Enter zum Senden)"
              rows={1}
              style={{
                flex:        1,
                resize:      "none",
                border:      "1px solid #e2e8f0",
                borderRadius: 10,
                padding:     "8px 12px",
                fontSize:    13,
                outline:     "none",
                fontFamily:  "inherit",
                lineHeight:  1.4,
                background:  "white",
                color:       "#1e293b",
                maxHeight:   80,
                overflowY:   "auto",
              }}
              onInput={e => {
                const t = e.currentTarget
                t.style.height = "auto"
                t.style.height = `${Math.min(t.scrollHeight, 80)}px`
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              style={{
                width:        36,
                height:       36,
                borderRadius: 10,
                background:   !input.trim() || loading ? "#e2e8f0" : "#1d4ed8",
                border:       "none",
                cursor:       !input.trim() || loading ? "not-allowed" : "pointer",
                display:      "flex",
                alignItems:   "center",
                justifyContent: "center",
                flexShrink:   0,
                transition:   "background 0.15s",
              }}
              aria-label="Senden"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M14 8L2 2l2.5 6L2 14l12-6z"
                  fill={!input.trim() || loading ? "#94a3b8" : "white"}/>
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Bounce animation keyframes */}
      <style>{`
        @keyframes chatBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
          40%            { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>
    </>
  )
}
