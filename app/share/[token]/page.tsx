"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Loader2, MessageCircle, User, Sun, Moon, Copy, Download } from "lucide-react"
import type { Chat, Source } from "@/types/chat"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { cn } from "@/lib/utils"
import { SourcesDisplay } from "@/components/chat/sources-display"

export default function SharedChatPage() {
  const params = useParams()
  const token = params.token as string
  
  const [chat, setChat] = useState<Chat | null>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copiedMap, setCopiedMap] = useState<Record<string, "copied" | "url" | "failed" | undefined>>({})
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try {
      const stored = typeof window !== "undefined" ? localStorage.getItem("radhika-theme") : null
      if (stored === "dark") return "dark"
      if (stored === "light") return "light"
      if (typeof window !== "undefined" && document.documentElement.classList.contains("dark")) return "dark"
    } catch (e) {}
    return "light"
  })

  useEffect(() => {
    // Initialize theme from localStorage or html class
    try {
      const stored = localStorage.getItem("radhika-theme")
      if (stored === "dark" || (!stored && document.documentElement.classList.contains("dark"))) {
        setTheme("dark")
        document.documentElement.classList.add("dark")
      } else {
        setTheme("light")
        document.documentElement.classList.remove("dark")
      }
    } catch (e) {}

    async function loadSharedChat() {
      if (!token) return

      try {
        setLoading(true)
        setError(null)

        // Load the chat by share token via API (public access)
        const response = await fetch(`/api/share/${token}`)
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: "Chat not found" }))
          setError(errorData.error || "This chat link is invalid or has been removed.")
          return
        }

        const data = await response.json()
        
        setChat(data.chat)

        // Format messages
        const formattedMessages = data.messages.map((msg: any) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          createdAt: msg.created_at ? new Date(msg.created_at) : undefined,
        }))

        setMessages(formattedMessages)
      } catch (err) {
        console.error("Failed to load shared chat:", err)
        setError("Failed to load this chat. It may no longer be available.")
      } finally {
        setLoading(false)
      }
    }

    loadSharedChat()
  }, [token])

  function setCopied(key: string, status: "copied" | "url" | "failed" = "copied") {
    setCopiedMap((s) => ({ ...s, [key]: status }))
    setTimeout(() => setCopiedMap((s) => ({ ...s, [key]: undefined })), 1500)
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch (e) {
      console.error("copy failed", e)
      return false
    }
  }

  async function copyImageToClipboard(src: string): Promise<"blob" | "url" | false> {
    try {
      if (!(navigator as any).clipboard) {
        // Clipboard API not available, copy URL
        try {
          await navigator.clipboard.writeText(src)
          return "url"
        } catch (e) {
          console.error("clipboard not available and writing url failed", e)
          return false
        }
      }

      if ((window as any).ClipboardItem) {
        try {
          const res = await fetch(src, { mode: "cors" })
          if (!res.ok) throw new Error(`fetch failed: ${res.status}`)
          const blob = await res.blob()
          const item = new (window as any).ClipboardItem({ [blob.type]: blob })
          await (navigator as any).clipboard.write([item])
          return "blob"
        } catch (err) {
          // Could fail due to CORS or platform restrictions. Fall back to copying URL.
          console.info("clipboard image write failed, falling back to URL", err)
          try {
            await navigator.clipboard.writeText(src)
            return "url"
          } catch (e2) {
            console.error("fallback copy url failed", e2)
            return false
          }
        }
      }

      // No ClipboardItem support, copy URL
      try {
        await navigator.clipboard.writeText(src)
        return "url"
      } catch (e) {
        console.error("copy image url failed", e)
        return false
      }
    } catch (e) {
      console.error("copy image failed", e)
      return false
    }
  }

  async function downloadImage(src: string, filename = "image") {
    try {
      const res = await fetch(src)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error("download failed", e)
    }
  }

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark"
    setTheme(next)
    try {
      localStorage.setItem("radhika-theme", next)
    } catch (e) {}
    if (next === "dark") document.documentElement.classList.add("dark")
    else document.documentElement.classList.remove("dark")
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-950 dark:to-blue-950">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" />
          <p className="text-sm text-slate-600 dark:text-slate-400">Loading shared chat...</p>
        </div>
      </div>
    )
  }

  if (error || !chat) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-950 dark:to-blue-950">
        <div className="mx-4 max-w-md rounded-2xl border border-red-200 bg-white p-8 text-center shadow-xl dark:border-red-900 dark:bg-slate-900">
          <div className="mb-4 text-6xl">🔒</div>
          <h1 className="mb-2 text-2xl font-bold text-slate-900 dark:text-white">
            Chat Not Available
          </h1>
          <p className="mb-6 text-slate-600 dark:text-slate-400">
            {error || "This chat link is invalid or has been removed."}
          </p>
          <a
            href="/"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            Go to Radhika
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-950 dark:to-blue-950">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-200/60 bg-white/80 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg">
              <span className="text-xl font-bold">R</span>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
                {chat.title}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Shared from Radhika • {messages.length} messages
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="group inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>

            <a
              href="/"
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Try Radhika
            </a>
          </div>
        </div>
      </header>

      {/* Chat Messages */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-slate-500 dark:text-slate-400">No messages in this chat.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((message) => {
              const isUser = message.role === "user"
              
              return (
                <div key={message.id} className={cn("flex gap-3", isUser && "flex-row-reverse")}>
                  {/* Avatar */}
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                      isUser
                        ? "bg-slate-200 dark:bg-slate-700"
                        : "bg-gradient-to-br from-blue-500 to-purple-600"
                    )}
                  >
                    {isUser ? (
                      <User className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                    ) : (
                      <MessageCircle className="h-4 w-4 text-white" />
                    )}
                  </div>

                  {/* Message Content */}
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-4 py-3",
                      isUser
                        ? "bg-gradient-to-r from-blue-500 to-purple-600 text-white"
                        : "border border-slate-200/60 bg-white/60 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/50 dark:text-slate-100"
                    )}
                  >
                    {isUser ? (
                      <span className="block">{message.content}</span>
                    ) : (
                      <div className="prose prose-sm max-w-none break-words dark:prose-invert [&_*]:break-words [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_code]:break-words [&_pre_code]:break-normal [&_pre]:whitespace-pre-wrap sm:[&_pre]:whitespace-pre">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            // Handle paragraphs that contain only an image: render a block wrapper with overlays
                            p: ({ node, children }: any) => {
                              try {
                                const onlyChild = node?.children && node.children.length === 1 && node.children[0]
                                if (onlyChild && onlyChild.type === 'element' && onlyChild.tagName === 'img') {
                                  const props = onlyChild.properties || {}
                                  const src = props.src
                                  const alt = props.alt || props.title || ''
                                  const key = `${message.id}-${src}`
                                  return (
                                    <div className="relative my-3">
                                      <img
                                        src={src}
                                        alt={alt}
                                        className="h-auto w-full rounded-2xl border border-white/40 dark:border-white/10"
                                        loading="lazy"
                                      />
                                      <div className="absolute right-2 top-2 flex gap-2">
                                        <button
                                          type="button"
                                          onClick={async () => {
                                            const res = await copyImageToClipboard(src || "")
                                            if (res === "blob") setCopied(key, "copied")
                                            else if (res === "url") setCopied(key, "url")
                                            else setCopied(key, "failed")
                                          }}
                                          title="Copy image"
                                          className="inline-flex items-center gap-2 rounded-md bg-white/90 px-2 py-1 text-xs font-medium text-slate-700 shadow-sm backdrop-blur-sm dark:bg-slate-800/80 dark:text-slate-200"
                                        >
                                          {copiedMap[key] === "copied" ? (
                                            <span className="text-xs">Copied</span>
                                          ) : copiedMap[key] === "url" ? (
                                            <span className="text-xs">Copied URL</span>
                                          ) : copiedMap[key] === "failed" ? (
                                            <span className="text-xs">Fail</span>
                                          ) : (
                                            <Copy className="h-4 w-4" />
                                          )}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => downloadImage(src || "image")}
                                          title="Download image"
                                          className="inline-flex items-center gap-2 rounded-md bg-white/90 px-2 py-1 text-xs font-medium text-slate-700 shadow-sm backdrop-blur-sm dark:bg-slate-800/80 dark:text-slate-200"
                                        >
                                          <Download className="h-4 w-4" />
                                        </button>
                                      </div>
                                    </div>
                                  )
                                }
                              } catch (e) {
                                // fallback to default paragraph
                              }
                              return <p>{children}</p>
                            },
                            img: ({ src, alt }) => (
                              <img
                                src={src}
                                alt={alt}
                                className="my-3 h-auto w-full rounded-2xl border border-white/40 dark:border-white/10"
                                loading="lazy"
                              />
                            ),
                            pre: ({ children }) => {
                              const codeEl = Array.isArray(children) ? children[0] as any : (children as any)
                              const codeText = codeEl?.props?.children ?? String(codeEl)
                              const key = `${message.id}-${String(codeText).slice(0,40)}-${String(codeText).length}`
                              return (
                                <div className="relative">
                                  <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-slate-100 p-4 text-sm text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:whitespace-pre">
                                    {children}
                                  </pre>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      await copyText(String(codeText))
                                      setCopied(key)
                                    }}
                                    title="Copy code"
                                    className="absolute right-2 top-2 inline-flex items-center gap-2 rounded-md bg-white/90 px-2 py-1 text-xs font-medium text-slate-700 shadow-sm backdrop-blur-sm dark:bg-slate-800/80 dark:text-slate-200"
                                  >
                                    {copiedMap[key] ? <span className="text-xs">Copied</span> : <Copy className="h-4 w-4" />}
                                  </button>
                                </div>
                              )
                            },
                            code: ({ inline, children, ...props }: any) => (
                              inline ? (
                                <code className="break-words rounded bg-slate-100 px-1 py-0.5 text-xs text-slate-900 dark:bg-slate-800 dark:text-slate-100" {...props}>
                                  {children}
                                </code>
                              ) : (
                                <code className="break-words text-xs text-slate-900 dark:text-slate-100" {...props}>
                                  {children}
                                </code>
                              )
                            ),
                          }}
                        >
                          {String(message.content)}
                        </ReactMarkdown>
                        {/* Display sources if available */}
                        {!isUser && (message as any).sources && (message as any).sources.length > 0 && (
                          <SourcesDisplay sources={(message as any).sources} />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200/60 bg-white/60 py-4 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/60">
        <div className="mx-auto max-w-5xl px-4 text-center">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            This is a read-only shared chat.{" "}
            <a href="/" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
              Create your own conversations
            </a>{" "}
            with Radhika.
          </p>
        </div>
      </footer>
    </div>
  )
}
