"use client"

import type { ReactNode } from "react"

import { cn } from "@/lib/utils"
import { useIsMobile } from "@/hooks/use-mobile"

interface ChatAppShellProps {
  sidebar: ReactNode
  topbar: ReactNode
  children: ReactNode
  insights?: ReactNode
  mobileSidebar?: ReactNode
  isPixel: boolean
  hasInsights?: boolean
}

export function ChatAppShell({ sidebar, topbar, children, insights, mobileSidebar, isPixel, hasInsights = false }: ChatAppShellProps) {
  const isMobile = useIsMobile()
  
  const gridClass = cn(
    "grid flex-1 gap-6",
    hasInsights
      ? "lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_320px]"
      : "lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)]",
  )

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.25),_transparent_55%),radial-gradient(circle_at_bottom,_rgba(139,92,246,0.18),_transparent_55%),linear-gradient(120deg,_rgba(15,23,42,0.08),_rgba(15,23,42,0.02))] dark:bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.22),_transparent_50%),radial-gradient(circle_at_bottom,_rgba(236,72,153,0.2),_transparent_55%),linear-gradient(120deg,_rgba(2,6,23,0.92),_rgba(2,6,23,0.85))]" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-white via-slate-50/60 to-slate-100 dark:from-slate-950 dark:via-slate-950/95 dark:to-slate-900/90" />

      {mobileSidebar}

      {/* Mobile: No padding, full screen */}
      {isMobile ? (
        <div className="relative z-10 min-h-screen w-full">
          {topbar}
          <div className="fixed top-[60px] bottom-0 left-0 right-0 flex flex-col overflow-hidden">
            {children}
          </div>
        </div>
      ) : (
        /* Desktop: Normal layout with padding and grids */
  <div className={cn(
        "relative z-10 mx-auto flex min-h-screen w-full max-w-[1400px] flex-col gap-6 px-3 pb-6 pt-6 sm:px-6 lg:px-8"
      )}>
        <div className={gridClass}>
          <aside className="hidden min-h-0 lg:flex w-[260px] xl:w-[280px] flex-shrink-0">
            {sidebar}
          </aside>
          <section
            className={cn(
              "flex min-w-0 flex-col overflow-hidden",
              isMobile ? "h-[calc(100vh-4rem)] p-2.5" : "h-[1000px] p-3 sm:p-5 lg:h-[850px]",
              isPixel
                ? "pixel-border pixel-surface pixel-shadow"
                : isMobile 
                  ? "rounded-2xl border border-white/60 bg-white/70 shadow-[0_18px_60px_-28px_rgba(15,23,42,0.45)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/60 dark:shadow-[0_20px_60px_-30px_rgba(15,23,42,0.65)]"
                  : "rounded-3xl border border-white/60 bg-white/70 shadow-[0_18px_60px_-28px_rgba(15,23,42,0.45)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/60 dark:shadow-[0_20px_60px_-30px_rgba(15,23,42,0.65)]",
            )}
          >
            <div className={cn("flex flex-1 min-h-0 flex-col", isMobile ? "gap-3" : "gap-4")}>
              {topbar}
              {children}
            </div>
          </section>
          {insights && hasInsights ? <aside className="hidden min-h-0 xl:flex w-[320px] flex-shrink-0">{insights}</aside> : null}
        </div>
      </div>
      )}
    </div>
  )
}
