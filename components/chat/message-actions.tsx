"use client"

import { useState } from "react"
import { Copy, Download, Star, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { chatService } from "@/lib/supabase/chat-service"
import { toast } from "sonner"
import { exportMessageAsPdf } from "@/lib/services/exports"

interface MessageActionsProps {
  messageId: string
  content: string
  isFavorite?: boolean
  onFavoriteChange?: (isFavorite: boolean) => void
}

export function MessageActions({ messageId, content, isFavorite = false, onFavoriteChange }: MessageActionsProps) {
  const [copied, setCopied] = useState(false)
  const [isTogglingFavorite, setIsTogglingFavorite] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      toast.success("Copied to clipboard")
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      toast.error("Failed to copy")
    }
  }

  const handleDownloadPDF = async () => {
    try {
      await exportMessageAsPdf(content, {
        title: "AI Response",
        includeTimestamps: true
      })
      toast.success("Downloaded as PDF")
    } catch (err) {
      console.error("PDF generation error:", err)
      toast.error("Failed to download PDF")
    }
  }

  const handleToggleFavorite = async () => {
    try {
      setIsTogglingFavorite(true)
      if (isFavorite) {
        await chatService.removeFromFavorites(messageId)
        toast.success("Removed from favorites")
        onFavoriteChange?.(false)
      } else {
        await chatService.addToFavorites(messageId)
        toast.success("Added to favorites")
        onFavoriteChange?.(true)
      }
    } catch (err) {
      toast.error("Failed to update favorite")
    } finally {
      setIsTogglingFavorite(false)
    }
  }

  return (
    <div className="flex items-center gap-0.5">
      <TooltipProvider delayDuration={300}>
        {/* Copy */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCopy}
              className="h-7 w-7 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Copy text</p>
          </TooltipContent>
        </Tooltip>

        {/* Download PDF */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDownloadPDF}
              className="h-7 w-7 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Download as PDF</p>
          </TooltipContent>
        </Tooltip>

        {/* Favorite */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleToggleFavorite}
              disabled={isTogglingFavorite}
              className="h-7 w-7 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <Star className={`h-3.5 w-3.5 ${isFavorite ? "fill-yellow-500 text-yellow-500" : ""}`} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{isFavorite ? "Remove from favorites" : "Add to favorites"}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  )
}
