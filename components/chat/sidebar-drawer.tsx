"use client"

import type { ReactNode } from "react"

import { Sheet, SheetContent } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

interface SidebarDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
  isPixel: boolean
}

export function SidebarDrawer({ open, onOpenChange, children, isPixel }: SidebarDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className={cn(
          "w-[90vw] max-w-sm border-0 bg-white/95 p-0 backdrop-blur-xl dark:bg-slate-950/95",
          isPixel
            ? "pixel-border pixel-surface pixel-shadow border-4 border-slate-500/80 bg-slate-200/95 dark:border-slate-600 dark:bg-slate-900/95"
            : "rounded-none border-white/10",
        )}
      >
        <div className="h-full overflow-y-auto p-5 sm:p-6">{children}</div>
      </SheetContent>
    </Sheet>
  )
}
