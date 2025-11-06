"use client"

import type { ReactNode } from "react"

import { cn } from "@/lib/utils"
import type { UIStyle } from "@/types/chat"

interface InsightsPanelProps {
  title?: string
  subtitle?: string
  children: ReactNode
  uiStyle: UIStyle
}

export function InsightsPanel({ title = "Conversation Heatmap", subtitle = "Daily engagement and mode distribution", children, uiStyle }: InsightsPanelProps) {
  const isPixel = uiStyle === "pixel"

  return (
    <div
      className={cn(
        "flex h-full min-h-0 w-full flex-col border px-4 py-5",
        isPixel
          ? "pixel-border pixel-surface pixel-shadow border-slate-500/80"
          : "rounded-[32px] border-white/50 bg-white/60 backdrop-blur-xl shadow-[0_18px_55px_-32px_rgba(15,23,42,0.4)] dark:border-white/10 dark:bg-slate-900/60",
      )}
    >
      <div className="space-y-1 pb-4">
        <h3 className={cn("text-lg font-semibold text-slate-900 dark:text-slate-100", isPixel && "pixel-font text-base")}>{title}</h3>
        {subtitle && <p className={cn("text-sm text-slate-500 dark:text-slate-400", isPixel && "pixel-font text-xs")}>{subtitle}</p>}
      </div>
      <div className="relative flex-1 min-h-0 overflow-hidden rounded-[24px] border border-white/50 bg-white/70 dark:border-white/10 dark:bg-slate-900/60">
        <div className="h-full w-full overflow-auto p-3">
          {children}
        </div>
      </div>
    </div>
  )
}
