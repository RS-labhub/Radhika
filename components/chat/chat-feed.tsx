"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { Components } from "react-markdown"
import { cn } from "@/lib/utils"
import { AIVisualization } from "@/components/ai-visualization"
import { User, Volume2, VolumeX } from "lucide-react"
import type { Mode, ModeDefinition, UIStyle } from "@/types/chat"
import { Button } from "@/components/ui/button"

type MessageContent = string | Array<{ type?: string; text?: string; value?: string } | string>

interface BaseMessage {
  id: string
  role: string
  content: MessageContent
  createdAt?: string | number | Date
}

interface ChatFeedProps {
  messages: BaseMessage[]
  currentMode: ModeDefinition
  uiStyle: UIStyle
  MarkdownComponents: Components
  formatTime: (timestamp: number) => string
  isLoading: boolean
  isListening: boolean
  messagesEndRef: { current: HTMLDivElement | null }
  quickActions: string[]
  onQuickAction: (action: string) => void
  mode: Mode
  onImageRetry?: (messageId: string) => void
  // Speech props
  isSpeaking?: boolean
  currentSpeakingMessageId?: string | null
  onSpeakMessage?: (text: string, messageId: string, mode: Mode) => void
  onStopSpeaking?: () => void
}

export function ChatFeed({
  messages,
  currentMode,
  uiStyle,
  MarkdownComponents,
  formatTime,
  isLoading,
  isListening,
  messagesEndRef,
  quickActions,
  onQuickAction,
  mode,
  onImageRetry,
  isSpeaking,
  currentSpeakingMessageId,
  onSpeakMessage,
  onStopSpeaking,
}: ChatFeedProps) {
  const isPixel = uiStyle === "pixel"
  const CurrentModeIcon = currentMode.icon

  const containerClass = cn(
    "flex flex-1 min-h-0 flex-col overflow-hidden gap-4",
    isPixel
      ? "pixel-panel px-4 py-5 text-slate-700 dark:text-slate-200"
      : "rounded-[24px] border px-3 py-4 sm:px-5 border-white/60 bg-white/60 backdrop-blur-xl shadow-[0_20px_55px_-32px_rgba(15,23,42,0.4)] dark:border-white/10 dark:bg-slate-900/50",
  )
  const markdownStyle = isPixel ? { fontSize: "0.82rem", lineHeight: "1.55" } : undefined

  // Flatten possible structured content from the API into plain text.
  const normalizeContent = (content: MessageContent): string => {
    if (typeof content === "string") return content
    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part === "string") return part
          return part.text ?? part.value ?? ""
        })
        .join(" ")
    }
    return ""
  }

  return (
    <div className={containerClass}>
      {messages.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="scale-90 sm:scale-100">
              <AIVisualization mode={mode} isActive={isLoading || isListening} />
            </div>
            <div className="space-y-2">
              <h3
                className={cn(
                  "text-xl font-semibold text-slate-900 dark:text-slate-100 sm:text-2xl",
                  isPixel && "pixel-heading text-[1.05rem] text-slate-800 dark:text-slate-100",
                )}
              >
                {mode === "bff"
                  ? "Hey bestie! Ready when you are."
                  : `What can I help you ${mode === "creative" ? "create" : "with"}?`}
              </h3>
              <p
                className={cn(
                  "text-sm text-slate-500 dark:text-slate-400 sm:text-base",
                  isPixel && "pixel-subheading text-[0.75rem] leading-relaxed text-slate-600 dark:text-slate-300",
                )}
              >
                Select a quick action or start typing to begin the conversation.
              </p>
            </div>
          </div>
          <div
            className={cn(
              "flex flex-wrap items-center justify-center gap-2",
              isPixel && "gap-2",
            )}
          >
            {quickActions.map((action) => (
              <button
                key={action}
                type="button"
                onClick={() => onQuickAction(action)}
                className={cn(
                  isPixel
                    ? "pixel-tile pixel-quick-action inline-flex items-center gap-2 px-3 py-2 text-[0.78rem] text-slate-700 transition-transform hover:-translate-y-[1px] dark:text-slate-100"
                    : "rounded-full border border-white/40 bg-white/40 px-4 py-2 text-sm font-medium text-slate-600 hover:border-slate-400 hover:text-slate-900 dark:border-white/10 dark:text-slate-300 dark:hover:text-white dark:bg-slate-900/40 dark:hover:bg-slate-800/60 backdrop-blur",
                )}
              >
                {isPixel ? (
                  <>
                    <span>{action}</span>
                    <span className="text-[0.65rem] text-slate-400 dark:text-slate-500">↗</span>
                  </>
                ) : (
                  action
                )}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 min-h-0 overflow-y-auto pr-1 sm:pr-2 scrollbar-thin">
            <div className="flex flex-col gap-4">
              {messages.map((message) => {
                const isUser = message.role === "user"
                const timestamp = message.createdAt ? new Date(message.createdAt).getTime() : Date.now()
                const normalizedContent = normalizeContent(message.content)

                return (
                  <div
                    key={message.id}
                    className={cn("flex w-full gap-3", isUser ? "justify-end" : "justify-start")}
                  >
                  {!isUser && (
                    <div
                      className={cn(
                        "mt-1 flex h-9 w-9 flex-shrink-0 items-center justify-center",
                        isPixel
                          ? "pixel-icon text-slate-800 dark:text-slate-100"
                          : "rounded-2xl border border-white/40 bg-white/80 text-slate-700 shadow-sm dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100",
                      )}
                    >
                      <CurrentModeIcon className={cn("h-4 w-4", currentMode.color)} />
                    </div>
                  )}
                  <div className={cn("max-w-[82%] sm:max-w-[70%] min-w-0", isUser && "flex flex-col items-end")}>
                    <div
                      className={cn(
                        "px-4 py-3 text-sm leading-relaxed break-words overflow-wrap-anywhere",
                        isUser
                          ? isPixel
                            ? cn(
                                "pixel-tile pixel-tile-active text-[0.8rem] font-semibold leading-relaxed text-slate-900 dark:text-slate-100",
                                currentMode.borderPixel,
                              )
                            : cn(
                                "rounded-3xl bg-gradient-to-r text-white shadow-lg",
                                currentMode.gradient,
                                "text-white",
                              )
                          : isPixel
                            ? "pixel-tile text-[0.82rem] leading-relaxed text-slate-700 dark:text-slate-100"
                            : "rounded-3xl border border-slate-200/60 text-slate-700 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-900/80 dark:text-slate-100",
                      )}
                    >
                      {isUser ? (
                        <span className={cn("block", isPixel && "text-[0.78rem] font-medium tracking-[0.02em]")}>{normalizedContent}</span>
                      ) : (
                        <div className="prose prose-sm max-w-none break-words dark:prose-invert [&_*]:break-words [&_pre]:whitespace-pre-wrap [&_code]:break-words" style={markdownStyle}>
                          <ReactMarkdown 
                            remarkPlugins={[remarkGfm]}
                            components={{
                              ...MarkdownComponents,
                              img: ({ src, alt }) => {
                                // Check if this is a generated image (has "Generated image" in alt or specific markers)
                                const isGeneratedImage = alt?.includes("Generated image") || normalizedContent.includes("**Prompt:**")
                                
                                if (isGeneratedImage && onImageRetry) {
                                  // Dynamically import and render GeneratedImage component
                                  const GeneratedImage = require("@/components/chat/generated-image").GeneratedImage
                                  return (
                                    <GeneratedImage
                                      src={src || ""}
                                      alt={alt || ""}
                                      onRetry={() => onImageRetry(message.id)}
                                      isPixel={isPixel}
                                    />
                                  )
                                }
                                
                                // Regular image
                                return (
                                  <img
                                    src={src}
                                    alt={alt}
                                    className={cn(
                                      "w-full h-auto my-3",
                                      isPixel
                                        ? "pixel-border border-2 border-slate-500/80 dark:border-slate-600"
                                        : "rounded-2xl border border-white/40 dark:border-white/10"
                                    )}
                                    loading="lazy"
                                  />
                                )
                              },
                            }}
                          >
                            {normalizedContent}
                          </ReactMarkdown>
                        </div>
                      )}
                    </div>
                    <div
                      className={cn(
                        "mt-1 flex items-center gap-2",
                        isUser ? "justify-end" : "justify-start",
                      )}
                    >
                      <p
                        className={cn(
                          "text-[11px] uppercase tracking-[0.24em] text-slate-400",
                          isPixel && "pixel-label text-[0.6rem] tracking-[0.3em] text-slate-400 dark:text-slate-500",
                        )}
                      >
                        {formatTime(timestamp)}
                      </p>
                      {!isUser && onSpeakMessage && onStopSpeaking && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (isSpeaking && currentSpeakingMessageId === message.id) {
                              onStopSpeaking()
                            } else {
                              onSpeakMessage(normalizedContent, message.id, mode)
                            }
                          }}
                          className={cn(
                            "h-6 w-6 p-0",
                            isPixel
                              ? "pixel-control text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                              : "rounded-full text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300",
                            isSpeaking && currentSpeakingMessageId === message.id && "text-cyan-500 dark:text-cyan-400"
                          )}
                          aria-label={isSpeaking && currentSpeakingMessageId === message.id ? "Stop speaking" : "Listen to message"}
                        >
                          {isSpeaking && currentSpeakingMessageId === message.id ? (
                            <VolumeX className="h-3.5 w-3.5" />
                          ) : (
                            <Volume2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                  {isUser && (
                    <div
                      className={cn(
                        "mt-1 flex h-9 w-9 flex-shrink-0 items-center justify-center",
                        isPixel
                          ? "pixel-icon text-slate-800 dark:text-slate-100"
                          : "rounded-2xl border border-white/40 bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg",
                      )}
                    >
                      <User className="h-4 w-4" />
                    </div>
                  )}
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>
          </div>
          {isLoading && (
            <div
              className={cn(
                "flex items-center gap-2 text-xs uppercase tracking-[0.4em] text-slate-500 dark:text-slate-400",
                isPixel && "pixel-label text-[0.6rem] tracking-[0.28em] text-slate-500 dark:text-slate-400",
              )}
            >
              <span
                className={cn(
                  "flex h-2 w-2 animate-pulse rounded-full bg-cyan-500",
                  isPixel && "rounded-sm",
                )}
              />
              <span
                className={cn(
                  isPixel
                    ? "pixel-subheading text-[0.7rem] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400"
                    : undefined,
                )}
              >
                Generating
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
