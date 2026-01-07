"use client"

import type { ReactNode } from "react"

import { cn } from "@/lib/utils"
import type { UIStyle } from "@/types/chat"

interface InsightsPanelProps {
  title?: string
  subtitle?: string
  children: ReactNode
  uiStyle: UIStyle
  collapsible?: boolean
  onCollapse?: () => void
}

export function InsightsPanel({
  title = "Conversation Heatmap",
  subtitle = "Daily engagement and mode distribution",
  children,
  uiStyle,
  collapsible = false,
  onCollapse,
}: InsightsPanelProps) {
  const isPixel = uiStyle === "pixel"

  const collapseButtonClass = cn(
    "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-slate-600 transition",
    isPixel
      ? "pixel-control text-slate-700 hover:text-slate-900 dark:text-slate-200 dark:hover:text-white"
      : "border-white/40 bg-white/70 hover:bg-white/90 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800/80",
  )

  return (
    <div
      className={cn(
        "flex h-full min-h-0 w-full flex-col border px-4 py-5",
        isPixel
          ? "pixel-border pixel-surface pixel-shadow border-slate-500/80"
          : "rounded-[32px] border-white/50 bg-white/60 backdrop-blur-xl shadow-[0_18px_55px_-32px_rgba(15,23,42,0.4)] dark:border-white/10 dark:bg-slate-900/60",
      )}
    >
      <div className="flex items-start justify-between gap-3 pb-4">
        <div className="space-y-1">
          <h3 className={cn("text-lg font-semibold text-slate-900 dark:text-slate-100", isPixel && "pixel-font text-base")}>{title}</h3>
          {subtitle && <p className={cn("text-sm text-slate-500 dark:text-slate-400", isPixel && "pixel-font text-xs")}>{subtitle}</p>}
        </div>
        {collapsible && onCollapse ? (
          <button type="button" className={collapseButtonClass} onClick={onCollapse} aria-label="Collapse conversation heatmap">
            Hide
          </button>
        ) : null}
      </div>
      <div className="relative flex-1 min-h-0 overflow-hidden rounded-[24px] border border-white/50 bg-white/70 dark:border-white/10 dark:bg-slate-900/60">
        <div className="h-full w-full overflow-auto p-3">{children}</div>
      </div>
    </div>
  )
}
