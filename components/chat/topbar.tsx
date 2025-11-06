"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { Mode, ModeDefinition, UIStyle } from "@/types/chat"
import {
  AlertCircle,
  Github,
  Gamepad2,
  Menu,
  MessageCircle,
  Moon,
  Palette,
  Sparkles,
  Sun,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react"

interface ChatTopbarProps {
  mode: Mode
  modeMeta: ModeDefinition
  uiStyle: UIStyle
  onToggleUI: () => void
  darkMode: boolean
  onToggleTheme: () => void
  messageCount: number
  voiceEnabled: boolean
  onToggleVoice: () => void
  onClearChat: () => void
  onOpenSidebar: () => void
  providerLabel: string
  error: string | null
  onDismissError: () => void
}

export function ChatTopbar({
  mode,
  modeMeta,
  uiStyle,
  onToggleUI,
  darkMode,
  onToggleTheme,
  messageCount,
  voiceEnabled,
  onToggleVoice,
  onClearChat,
  onOpenSidebar,
  providerLabel,
  error,
  onDismissError,
}: ChatTopbarProps) {
  const isPixel = uiStyle === "pixel"
  const CurrentModeIcon = modeMeta.icon

  const surfaceClass = cn(
    "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between",
    isPixel
      ? "pixel-panel px-3 py-3 sm:px-4 text-slate-700 dark:text-slate-200"
      : "rounded-2xl border border-white/50 bg-white/70 px-3 py-3 sm:px-4 sm:py-3 backdrop-blur-md shadow-[0_12px_34px_-26px_rgba(15,23,42,0.45)] dark:border-white/10 dark:bg-slate-900/60",
  )

  const iconWrapClass = cn(
    "flex h-10 w-10 shrink-0 items-center justify-center",
    isPixel
      ? "pixel-icon text-slate-900 dark:text-slate-100"
      : "rounded-xl border border-white/40 bg-white/90 text-slate-800 shadow-sm dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100",
  )

  const controlButton = isPixel
    ? "pixel-control inline-flex h-7 w-7 shrink-0 items-center justify-center p-0 text-xs text-slate-600 transition-all hover:text-slate-900 dark:text-slate-300 dark:hover:text-white sm:h-8 sm:w-8"
    : "inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/40 bg-white/70 p-0 text-slate-500 transition-colors hover:bg-white hover:text-slate-900 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-400 dark:hover:bg-slate-800/80 dark:hover:text-white"

  const controlsContainerClass = cn(
    "flex items-center gap-1.5 sm:flex sm:items-center sm:gap-2",
    isPixel &&
      "sm:ml-auto sm:grid sm:[grid-template-columns:repeat(3,max-content)] sm:items-center sm:justify-end sm:gap-x-1.5 sm:gap-y-1",
  )

  return (
    <div className="flex flex-col gap-2">
      <div className={surfaceClass}>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className={iconWrapClass}>
            <CurrentModeIcon className={cn("h-5 w-5", modeMeta.color)} />
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2
                className={cn(
                  "truncate text-lg font-semibold text-slate-900 dark:text-slate-100",
                  isPixel && "pixel-heading text-[0.9rem] text-slate-800 dark:text-slate-100 sm:text-[1rem]",
                )}
                title={`${modeMeta.label} Assistant`}
              >
                {modeMeta.label} Assistant
              </h2>
              <Badge
                variant="secondary"
                className={cn(
                  "rounded-full px-2.5 text-[0.7rem] font-semibold tracking-wide",
                  isPixel
                    ? "pixel-badge text-[0.62rem] tracking-[0.08em] text-slate-600 dark:text-slate-200 sm:text-[0.7rem]"
                    : "border-0 bg-slate-900/5 text-slate-600 dark:bg-white/10 dark:text-white",
                )}
              >
                {providerLabel}
              </Badge>
              <Badge
                variant="outline"
                className={cn(
                  "flex items-center gap-1 rounded-full px-2.5 text-[0.65rem] font-semibold uppercase tracking-[0.18em]",
                  isPixel
                    ? "pixel-badge text-[0.56rem] tracking-[0.12em] text-slate-600 dark:text-slate-200 sm:text-[0.62rem]"
                    : "border-slate-300/70 text-slate-500 dark:border-white/15 dark:text-slate-200",
                )}
              >
                <Sparkles className="h-3 w-3" />
                {mode.toUpperCase()}
              </Badge>
            </div>
            <p
              className={cn(
                "text-sm text-slate-500 dark:text-slate-400",
                isPixel && "pixel-subheading text-[0.7rem] leading-relaxed text-slate-600 dark:text-slate-300 sm:text-[0.75rem]",
              )}
            >
              {modeMeta.description}
            </p>
          </div>
        </div>
        <div className={controlsContainerClass}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onOpenSidebar}
            className={cn(
              "flex items-center gap-1 rounded-full border border-white/40 bg-white/70 px-3 py-1.5 text-sm font-medium text-slate-600 hover:border-white/70 hover:bg-white/90 hover:text-slate-900 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-white",
              isPixel && "pixel-control rounded-full px-3 py-1 text-xs text-slate-700 dark:text-slate-200",
              "lg:hidden",
            )}
            aria-label="Open navigation"
          >
            <Menu className="h-4 w-4" />
            <span className={cn(isPixel && "text-[0.75rem] tracking-[0.08em]")}>Menu</span>
          </Button>
          <Badge
            variant="secondary"
            className={cn(
              "h-7 items-center gap-1 rounded-full px-2.5 text-[0.75rem] font-semibold",
              isPixel
                ? "pixel-badge h-7 text-[0.62rem] text-slate-600 dark:text-slate-200 sm:text-[0.7rem]"
                : "border-0 bg-slate-900/5 text-slate-600 dark:bg-white/10 dark:text-white",
            )}
          >
            <MessageCircle className="h-3 w-3" />
            {messageCount}
          </Badge>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onToggleVoice}
            className={controlButton}
            aria-pressed={voiceEnabled}
            aria-label={voiceEnabled ? "Disable voice responses" : "Enable voice responses"}
          >
            {voiceEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onToggleUI}
            className={controlButton}
            aria-label="Toggle interface style"
          >
            {uiStyle === "modern" ? <Gamepad2 className="h-4 w-4" /> : <Palette className="h-4 w-4" />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onToggleTheme}
            className={controlButton}
            aria-label={darkMode ? "Use light theme" : "Use dark theme"}
          >
            {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClearChat}
            className={cn(
              controlButton,
              isPixel
                ? "pixel-control-alert text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300"
                : "text-rose-500 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300",
            )}
            aria-label="Clear conversation"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(controlButton, "hidden sm:inline-flex")}
            asChild
            aria-label="View source on GitHub"
          >
            <a href="https://github.com/RS-labhub/radhika" target="_blank" rel="noopener noreferrer">
              <Github className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>

      {error && (
        <div
          className={cn(
            "flex items-center gap-3 px-3 py-2 text-sm text-rose-600 dark:text-rose-300",
            isPixel
              ? "pixel-tile border-rose-400 bg-rose-100/70 text-rose-700 dark:border-rose-500 dark:bg-rose-900/40"
              : "rounded-xl border border-rose-200/80 bg-rose-50/80 dark:border-rose-500/40 dark:bg-rose-900/30",
          )}
        >
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span
            className={cn(
              "flex-1",
              isPixel && "pixel-subheading text-[0.72rem] leading-snug text-rose-700 dark:text-rose-200",
            )}
          >
            {error}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onDismissError}
            className={cn(controlButton, "!h-7 !w-7")}
          >
            X
          </Button>
        </div>
      )}
    </div>
  )
}
