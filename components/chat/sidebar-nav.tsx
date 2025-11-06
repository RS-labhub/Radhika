"use client"

import { Fragment } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { Mode, ModeDefinition, UIStyle } from "@/types/chat"
import { Settings } from "lucide-react"

interface SidebarNavProps {
  mode: Mode
  modes: Record<Mode, ModeDefinition>
  quickActions: string[]
  onModeChange: (mode: Mode) => void
  onQuickAction: (action: string) => void
  modeCounts: Record<Mode, number>
  uiStyle: UIStyle
  onDismiss?: () => void
  onOpenSettings?: () => void
}

export function SidebarNav({ mode, modes, quickActions, onModeChange, onQuickAction, modeCounts, uiStyle, onDismiss, onOpenSettings }: SidebarNavProps) {
  const isPixel = uiStyle === "pixel"

  const wrapperClass = cn(
    "relative flex h-full w-full flex-col",
    isPixel
      ? "pixel-panel gap-5 px-5 pb-6 pt-5 text-slate-700 dark:text-slate-200"
      : "gap-6 rounded-[32px] border border-white/40 bg-white/65 p-6 backdrop-blur-xl shadow-[0_20px_60px_-30px_rgba(15,23,42,0.35)] dark:border-white/10 dark:bg-slate-900/65 dark:shadow-[0_24px_70px_-32px_rgba(2,6,23,0.85)]",
  )

  const sectionTitleClass = isPixel
    ? "pixel-label"
    : "text-[11px] uppercase tracking-[0.28em] text-slate-500 dark:text-slate-300/70"

  const buttonBaseClass = isPixel
    ? "pixel-tile group flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-slate-700 transition-all duration-150 dark:text-slate-100"
    : "group flex w-full items-center justify-between rounded-2xl border px-3 py-2 text-left text-sm transition-all duration-200"

  return (
    <div className={wrapperClass}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p
              className={cn(
                "text-xs font-medium text-slate-500",
                isPixel && "pixel-label text-[0.65rem] text-slate-600 dark:text-slate-300",
              )}
            >
              NEW DESIGN
            </p>
            <h1
              className={cn(
                "text-2xl font-semibold text-slate-900 transition-colors dark:text-slate-100",
                isPixel && "pixel-heading text-[1.1rem] text-slate-800 dark:text-slate-100",
              )}
            >
              RADHIKA
            </h1>
          </div>
          <Badge
            variant="secondary"
            className={cn(
              "rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600 shadow-sm dark:bg-slate-800/70 dark:text-slate-200",
              isPixel && "pixel-badge",
            )}
          >
            v2.0
          </Badge>
        </div>
        <p
          className={cn(
            "text-sm text-slate-500 dark:text-slate-400",
            isPixel && "pixel-subheading text-[0.75rem] leading-relaxed text-slate-600 dark:text-slate-300",
          )}
        >
          AI companion with adaptive personalities and immersive feedback with Radhika's magic.
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className={sectionTitleClass}>Modes</h2>
          {onOpenSettings && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onOpenSettings}
              className={cn(
                "h-7 w-7",
                isPixel
                  ? "pixel-control text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                  : "rounded-lg border border-white/40 bg-white/70 text-slate-500 hover:bg-white hover:text-slate-900 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-400 dark:hover:bg-slate-800/80 dark:hover:text-white"
              )}
              aria-label="Manage API Keys"
            >
              <Settings className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="grid gap-2">
          {Object.entries(modes).map(([key, meta]) => {
            const castKey = key as Mode
            const ModeIcon = meta.icon
            const isActive = castKey === mode

            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  onModeChange(castKey)
                  onDismiss?.()
                }}
                className={cn(
                  buttonBaseClass,
                  isActive
                    ? isPixel
                      ? "pixel-tile-active"
                      : "border-transparent bg-gradient-to-br from-white  to-gray-100/60 text-slate-800 shadow-[0_14px_45px_-30px_rgba(14,165,233,0.55)] ring-offset-0 dark:from-slate-900/90 dark:via-slate-900/60 dark:to-slate-800/60"
                    : isPixel
                      ? undefined
                      : "border-white/30 bg-white/30 text-slate-600 hover:border-white/70 hover:bg-white/70 dark:border-white/5 dark:bg-slate-900/30 dark:text-slate-300 dark:hover:bg-slate-800/40",
                )}
              >
                <span className="flex items-center gap-3">
                  <span
                    className={cn(
                      isPixel
                        ? "pixel-icon"
                        : "flex h-9 w-9 items-center justify-center rounded-2xl border border-white/40 bg-white/80 shadow-sm dark:border-white/10 dark:bg-slate-900/60",
                    )}
                  >
                    <ModeIcon className={cn("h-4 w-4", meta.color)} />
                  </span>
                  <span
                    className={cn(
                      "font-medium text-slate-700 dark:text-slate-100",
                      isPixel && "text-[0.8rem] tracking-[0.04em]",
                    )}
                  >
                    {meta.label}
                  </span>
                </span>
                {modeCounts[castKey] > 0 ? (
                  <span
                    className={cn(
                      isPixel
                        ? "pixel-chip"
                        : "flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-slate-900/10 px-2 text-xs font-semibold text-slate-600 dark:bg-white/10 dark:text-white",
                    )}
                  >
                    {modeCounts[castKey]}
                  </span>
                ) : (
                  <span
                    className={cn(
                      "text-[11px] text-slate-400 dark:text-slate-500",
                      isPixel && "pixel-subheading text-[0.7rem] text-slate-400 dark:text-slate-500",
                    )}
                  >
                    &nbsp;
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-auto space-y-3">
        <h2 className={sectionTitleClass}>Quick Actions</h2>
        <div className="grid gap-2">
          {quickActions.map((action) => (
            <Fragment key={action}>
              <button
                type="button"
                onClick={() => {
                  onQuickAction(action)
                  onDismiss?.()
                }}
                className={cn(
                  "flex w-full items-center justify-between text-left transition-colors",
                  isPixel
                    ? "pixel-tile pixel-quick-action px-3 py-2"
                    : "rounded-full border px-4 py-2 text-sm font-medium text-slate-600 hover:border-slate-400 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white border-white/40 bg-white/40 backdrop-blur hover:bg-white/70 dark:border-white/10 dark:bg-slate-900/40 dark:hover:bg-slate-800/60",
                )}
              >
                <span className={cn(isPixel && "text-[0.78rem]")}>{action}</span>
                {isPixel ? <span className="text-[0.65rem] text-slate-400 dark:text-slate-500">↗</span> : null}
              </button>
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  )
}
