"use client"

import { cn } from "@/lib/utils"
import { MessageCircle, User } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

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
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
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
