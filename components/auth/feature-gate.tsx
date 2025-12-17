"use client"

import { type ReactNode } from "react"
import Link from "next/link"
import { useFeatureAccess } from "@/hooks/use-feature-access"
import { Button } from "@/components/ui/button"
import { Lock, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

type FeatureKey = 
  | "canUseVoiceNarration"
  | "canUsePersonalization"
  | "canUseImageGeneration"
  | "canUsePixelMode"
  | "canUseChatHistory"
  | "canUseProfiles"
  | "canUseExportTools"
  | "canUseFavorites"

interface FeatureGateProps {
  feature: FeatureKey
  children: ReactNode
  fallback?: ReactNode
  showUpgradePrompt?: boolean
  className?: string
}

export function FeatureGate({
  feature,
  children,
  fallback,
  showUpgradePrompt = true,
  className,
}: FeatureGateProps) {
  const access = useFeatureAccess()
  const hasAccess = access[feature]

  if (hasAccess) {
    return <>{children}</>
  }

  if (fallback) {
    return <>{fallback}</>
  }

  if (!showUpgradePrompt) {
    return null
  }

  return (
    <div className={cn(
      "relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 p-4",
      "bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800",
      className
    )}>
      <div className="flex flex-col items-center justify-center text-center gap-3 py-4">
        <div className="p-3 rounded-full bg-slate-200/50 dark:bg-slate-700/50">
          <Lock className="h-5 w-5 text-slate-500 dark:text-slate-400" />
        </div>
        <div>
          <h4 className="font-medium text-slate-900 dark:text-white mb-1">
            Sign in to unlock
          </h4>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            This feature is available to signed-in users
          </p>
        </div>
        <Link href="/auth/login">
          <Button size="sm" className="gap-2">
            <Sparkles className="h-4 w-4" />
            Sign In
          </Button>
        </Link>
      </div>
    </div>
  )
}

// Mode gate for restricting modes based on user role
interface ModeGateProps {
  mode: string
  children: ReactNode
  fallback?: ReactNode
}

export function ModeGate({ mode, children, fallback }: ModeGateProps) {
  const { canUseMode, isGuest } = useFeatureAccess()
  
  if (canUseMode(mode as any)) {
    return <>{children}</>
  }

  if (fallback) {
    return <>{fallback}</>
  }

  if (isGuest) {
    return (
      <div className="flex flex-col items-center justify-center text-center gap-3 p-6">
        <Lock className="h-8 w-8 text-slate-400" />
        <div>
          <h4 className="font-medium text-slate-900 dark:text-white mb-1">
            Sign in to access {mode} mode
          </h4>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Guests can only use General mode
          </p>
        </div>
        <Link href="/auth/login">
          <Button size="sm">Sign In</Button>
        </Link>
      </div>
    )
  }

  return null
}
