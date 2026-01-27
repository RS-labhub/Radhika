"use client"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { Mode, UIStyle } from "@/types/chat"
import Link from "next/link"
import { Menu, UserCircle, Download } from "lucide-react"
import { ProfileSelector } from "./profile-selector"

interface MobileTopbarProps {
  mode: Mode
  uiStyle: UIStyle
  onOpenSidebar: () => void
  userMenu?: React.ReactNode
  currentProfileId?: string | null
  onProfileSelect?: (profileId: string | null) => void
  isAuthenticated?: boolean
  onExportChat?: () => void
  messageCount?: number
}

export function MobileTopbar({
  mode,
  uiStyle,
  onOpenSidebar,
  userMenu,
  currentProfileId,
  onProfileSelect,
  isAuthenticated = false,
  onExportChat,
  messageCount = 0,
}: MobileTopbarProps) {
  const isPixel = uiStyle === "pixel"

  return (
    <div
      className={cn(
        "fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3 w-full",
        isPixel
          ? "pixel-panel text-slate-700 dark:text-slate-200 border-b-2 border-slate-500/80 bg-slate-200 dark:bg-slate-900"
          : "bg-white/98 backdrop-blur-xl border-b border-white/60 dark:bg-slate-900/98 dark:border-white/10",
      )}
    >
      <button
        type="button"
        onClick={onOpenSidebar}
        className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 -ml-2"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
        <span>Menu</span>
      </button>
      
      <div className="flex items-center gap-3">
        {isAuthenticated && onProfileSelect && (
          <ProfileSelector
            mode={mode}
            currentProfileId={currentProfileId}
            onProfileSelect={onProfileSelect}
            uiStyle={uiStyle}
            className=""
          />
        )}
        
        {onExportChat && messageCount > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onExportChat}
            className={cn(
              "h-9 w-9 rounded-full text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
              isPixel && "pixel-control"
            )}
            aria-label="Export chat"
            title="Export chat to PDF"
          >
            <Download className="h-4 w-4" />
          </Button>
        )}
        
        {isAuthenticated ? (
          userMenu
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "h-9 w-9 rounded-full text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
              isPixel && "pixel-control"
            )}
            asChild
          >
            <Link href="/auth/login" aria-label="Login">
              <UserCircle className="h-5 w-5" />
            </Link>
          </Button>
        )}
      </div>
    </div>
  )
}
