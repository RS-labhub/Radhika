"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { 
  ArrowLeft,
  Star,
  Copy,
  Trash2,
  Check,
  Loader2,
  MessageSquare,
  Clock
} from "lucide-react"
import { cn } from "@/lib/utils"
import { chatService } from "@/lib/supabase/chat-service"
import { toast } from "sonner"

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

export default function FavoritesPage() {
  const { user, isLoading: authLoading } = useAuth()
  const router = useRouter()
  
  const [favorites, setFavorites] = useState<FavoriteItem[]>([])
  const [isLoading, setIsLoading] = useState(false) // Start with false, not true
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth/login?redirectTo=/favorites")
    }
  }, [authLoading, user, router])

  useEffect(() => {
    const loadFavorites = async () => {
      if (!user) {
        setIsLoading(false)
        return
      }
      
      if (hasLoadedOnce && !loadError) return // Prevent re-fetching unless there was an error
      
      try {
        setIsLoading(true)
        setLoadError(false)
        
        // Set a safety timeout to ensure loading never hangs forever
        const safetyTimeout = setTimeout(() => {
          console.warn("Favorites load taking too long, clearing loading state")
          setIsLoading(false)
          setLoadError(true)
        }, 30000) // 30 seconds max
        
        const data = await chatService.getFavorites()
        
        clearTimeout(safetyTimeout)
        console.log("Loaded favorites:", data)
        setFavorites(data as FavoriteItem[])
        setHasLoadedOnce(true)
      } catch (err) {
        console.error("Failed to load favorites:", err)
        toast.error("Failed to load favorites")
        setLoadError(true)
        // Don't mark as loaded on error - allow retry
      } finally {
        setIsLoading(false)
      }
    }

    loadFavorites()
  }, [user, hasLoadedOnce, loadError])

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

  const handleRemoveFavorite = async (messageId: string) => {
    try {
      await chatService.removeFromFavorites(messageId)
      setFavorites(prev => prev.filter(f => f.message_id !== messageId))
      toast.success("Removed from favorites")
    } catch (err) {
      console.error("Failed to remove favorite:", err)
      toast.error("Failed to remove favorite")
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    })
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    )
  }

  if (!user) {
    return null
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="container mx-auto max-w-4xl px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold text-slate-900 dark:text-slate-100">
              <Star className="h-8 w-8 fill-yellow-500 text-yellow-500" />
              Favorites
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Your saved AI responses
            </p>
          </div>
        </div>

        {/* Content */}
        {favorites.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Star className="mb-4 h-16 w-16 text-slate-300 dark:text-slate-600" />
              <h3 className="mb-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                No favorites yet
              </h3>
              <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
                Star messages in your chats to save them here
              </p>
              <Link href="/">
                <Button>
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Start Chatting
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {favorites.map((favorite) => (
              <Card key={favorite.id} className="group overflow-hidden">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="flex-1 space-y-3">
                      {/* Header */}
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="capitalize">
                          {favorite.chat_messages.role}
                        </Badge>
                        <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                          <Clock className="h-3 w-3" />
                          {formatDate(favorite.created_at)}
                        </span>
                      </div>

                      {/* Content */}
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <p className="whitespace-pre-wrap text-slate-700 dark:text-slate-300">
                          {favorite.chat_messages.content}
                        </p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleCopy(favorite.chat_messages.content, favorite.id)}
                      >
                        {copiedId === favorite.id ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-600 hover:text-red-700"
                        onClick={() => handleRemoveFavorite(favorite.message_id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
