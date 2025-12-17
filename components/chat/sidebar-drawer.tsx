"use client"

import type { ReactNode } from "react"

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

interface SidebarDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
  isPixel: boolean
  side?: "left" | "right" | "top" | "bottom"
}

export function SidebarDrawer({ open, onOpenChange, children, isPixel, side = "left" }: SidebarDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={side}
        hideClose
        className={cn(
          "w-full max-w-none border-0 bg-white/95 p-0 backdrop-blur-xl dark:bg-slate-950/95 sm:w-[90vw] sm:max-w-sm",
          isPixel
            ? "pixel-border pixel-surface pixel-shadow border-4 border-slate-500/80 bg-slate-200/95 dark:border-slate-600 dark:bg-slate-900/95"
            : "rounded-none border-white/10",
        )}
      >
        <SheetTitle className="sr-only">Primary navigation</SheetTitle>
        <div className="h-full overflow-y-auto p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6">{children}</div>
      </SheetContent>
    </Sheet>
  )
}
