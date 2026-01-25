"use client"

import { useState, useEffect } from "react"
import { Star, Trash2, Loader2, Copy, Check } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { chatService } from "@/lib/appwrite/chat-service"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface FavoriteItem {
  id: string
  message_id: string
  created_at: string
  chat_messages: {
    id: string
    content: string
    role: string
    created_at: string
  }
}

interface FavoritesDialogProps {
  children?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function FavoritesDialog({ children, open, onOpenChange }: FavoritesDialogProps) {
  const [favorites, setFavorites] = useState<FavoriteItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      loadFavorites()
    }
  }, [open])

  const loadFavorites = async () => {
    try {
      setIsLoading(true)
      const data = await chatService.getFavorites()
      setFavorites(data as unknown as FavoriteItem[])
    } catch (err) {
      console.error("Failed to load favorites:", err)
      toast.error("Failed to load favorites")
    } finally {
      setIsLoading(false)
    }
  }

  const handleRemoveFavorite = async (messageId: string) => {
    try {
      await chatService.removeFavorite(messageId)
      setFavorites(prev => prev.filter(f => f.message_id !== messageId))
      toast.success("Removed from favorites")
    } catch (err) {
      toast.error("Failed to remove favorite")
    }
  }

  const handleCopy = async (content: string, id: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedId(id)
      toast.success("Copied to clipboard")
      setTimeout(() => setCopiedId(null), 2000)
    } catch (err) {
      toast.error("Failed to copy")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent className="sm:max-w-[600px] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 fill-yellow-500 text-yellow-500" />
            Favorite Messages
          </DialogTitle>
          <DialogDescription>
            Your saved AI responses
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[500px] pr-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : favorites.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Star className="h-12 w-12 text-slate-300 dark:text-slate-700 mb-4" />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No favorites yet
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                Star messages to save them here
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {favorites.map((fav) => (
                <div
                  key={fav.id}
                  className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                        {new Date(fav.chat_messages.created_at).toLocaleString()}
                      </div>
                      <div className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words">
                        {fav.chat_messages.content}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleCopy(fav.chat_messages.content, fav.id)}
                      >
                        {copiedId === fav.id ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50"
                        onClick={() => handleRemoveFavorite(fav.message_id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
