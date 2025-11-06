"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"
import { cn } from "@/lib/utils"

interface CodeBlockProps {
  children: string
  className?: string
  isPixel?: boolean
  isInline?: boolean
}

export function CodeBlock({ children, className, isPixel, isInline }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(String(children))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }

  // Inline code
  if (isInline) {
    return (
      <code
        className={cn(
          "rounded px-1.5 py-0.5 text-xs font-mono",
          "bg-slate-200 text-slate-800",
          "dark:bg-slate-800 dark:text-slate-200",
          isPixel && "pixel-border border-slate-500 px-2 py-1",
          className
        )}
      >
        {children}
      </code>
    )
  }

  // Block code with language
  const language = className?.replace("language-", "") || "code"

  return (
    <div className="group relative my-4">
      {/* Header with language and copy button */}
      <div
        className={cn(
          "flex items-center justify-between rounded-t-lg border-b px-4 py-2",
          "bg-slate-100 border-slate-300",
          "dark:bg-slate-800 dark:border-slate-700",
          isPixel && "pixel-border border-b-2"
        )}
      >
        <span
          className={cn(
            "text-xs font-medium uppercase tracking-wider",
            "text-slate-600 dark:text-slate-400",
            isPixel && "pixel-font text-[0.65rem]"
          )}
        >
          {language}
        </span>
        <button
          type="button"
          onClick={copyToClipboard}
          className={cn(
            "flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-all",
            "text-slate-600 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-700",
            copied && "text-green-600 dark:text-green-400",
            isPixel && "pixel-border pixel-font text-[0.65rem]"
          )}
          aria-label="Copy code"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code content */}
      <pre
        className={cn(
          "overflow-x-auto rounded-b-lg p-4 font-mono text-sm",
          "bg-slate-50 text-slate-900",
          "dark:bg-slate-900 dark:text-slate-100",
          isPixel && "pixel-border border-t-0"
        )}
      >
        <code className="block">{children}</code>
      </pre>
    </div>
  )
}
