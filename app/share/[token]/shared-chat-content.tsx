"use client"

import { cn } from "@/lib/utils"
import { MessageCircle, User, Copy, Download } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { useState } from "react"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  createdAt?: string
}

interface SharedChatContentProps {
  messages: Message[]
}

export function SharedChatContent({ messages }: SharedChatContentProps) {
  const [copiedMap, setCopiedMap] = useState<Record<string, "copied" | "url" | "failed" | undefined>>({})

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

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "flex gap-4 rounded-2xl p-4",
              message.role === "user"
                ? "bg-blue-50/50 dark:bg-blue-950/20"
                : "bg-white/50 dark:bg-slate-800/50"
            )}
          >
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                message.role === "user"
                  ? "bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400"
                  : "bg-gradient-to-br from-purple-500 to-blue-600 text-white"
              )}
            >
              {message.role === "user" ? (
                <User className="h-5 w-5" />
              ) : (
                <MessageCircle className="h-5 w-5" />
              )}
            </div>
            <div className="flex-1 overflow-hidden">
              <div className="mb-1 flex items-center gap-2">
                <span className="text-sm font-medium text-slate-900 dark:text-white">
                  {message.role === "user" ? "User" : "Radhika"}
                </span>
                {message.createdAt && (
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {new Date(message.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
              </div>
              <div className="prose prose-slate dark:prose-invert max-w-none text-sm">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
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
                      } catch (e) {}
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
                  {message.content}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
