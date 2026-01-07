"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { 
  Download, 
  Copy, 
  Star, 
  Share2, 
  Check, 
  FileText,
  Loader2 
} from "lucide-react"
import { cn } from "@/lib/utils"
import { 
  exportMessageAsPdf, 
  copyMessageToClipboard 
} from "@/lib/services/exports"
import { useFeatureAccess } from "@/hooks/use-feature-access"

interface MessageUtilitiesProps {
  messageId: string
  content: string
  isFavorite?: boolean
  onToggleFavorite?: (messageId: string, isFavorite: boolean) => void
  isPixel?: boolean
  className?: string
}

export function MessageUtilities({
  messageId,
  content,
  isFavorite = false,
  onToggleFavorite,
  isPixel = false,
  className,
}: MessageUtilitiesProps) {
  const [copied, setCopied] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [favorited, setFavorited] = useState(isFavorite)
  const { canUseExportTools, canUseFavorites, isAuthenticated } = useFeatureAccess()

  const handleCopy = async () => {
    const success = await copyMessageToClipboard(content)
    if (success) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleExportPdf = async () => {
    if (!canUseExportTools) return
    setIsExporting(true)
    try {
      await exportMessageAsPdf(content, {
        title: "Radhika AI Response",
      })
    } finally {
      setIsExporting(false)
    }
  }

  const handleToggleFavorite = () => {
    if (!canUseFavorites || !onToggleFavorite) return
    const newValue = !favorited
    setFavorited(newValue)
    onToggleFavorite(messageId, newValue)
  }

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Radhika AI Response",
          text: content,
        })
      } catch (error) {
        // User cancelled or share failed
        console.log("Share cancelled or failed")
      }
    } else {
      // Fallback to copy
      handleCopy()
    }
  }

  const buttonClass = cn(
    "h-7 w-7 p-0",
    isPixel
      ? "pixel-control text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
      : "rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:text-slate-500 dark:hover:text-slate-300 dark:hover:bg-slate-800"
  )

  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn(
        "flex items-center gap-1 mt-2 pt-2 border-t",
        isPixel 
          ? "border-slate-300/50 dark:border-slate-600/50" 
          : "border-slate-200/50 dark:border-slate-700/50",
        className
      )}>
        {/* Copy button - always available */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCopy}
              className={buttonClass}
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>{copied ? "Copied!" : "Copy as text"}</p>
          </TooltipContent>
        </Tooltip>

        {/* Export as PDF - authenticated only */}
        {canUseExportTools && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleExportPdf}
                disabled={isExporting}
                className={buttonClass}
              >
                {isExporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Download as PDF</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Favorite - authenticated only */}
        {canUseFavorites && onToggleFavorite && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleToggleFavorite}
                className={buttonClass}
              >
                <Star 
                  className={cn(
                    "h-4 w-4",
                    favorited && "fill-amber-400 text-amber-400"
                  )} 
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>{favorited ? "Remove from favorites" : "Add to favorites"}</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Share - authenticated only */}
        {isAuthenticated && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleShare}
                className={buttonClass}
              >
                <Share2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Share</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Login prompt for guests */}
        {!isAuthenticated && (
          <span className="text-xs text-slate-400 dark:text-slate-500 ml-2">
            Sign in for more options
          </span>
        )}
      </div>
    </TooltipProvider>
  )
}
