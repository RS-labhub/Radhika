"use client"

import { useState, useEffect, useCallback, useRef } from "react"
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
  Clock,
  RefreshCw
} from "lucide-react"
import { cn } from "@/lib/utils"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { Components } from "react-markdown"
import { chatService } from "@/lib/appwrite/chat-service"
import { localFavoritesStorage, type LocalFavorite } from "@/lib/services/local-favorites-storage"
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

// Convert LocalFavorite to FavoriteItem for compatibility
function toFavoriteItem(local: LocalFavorite): FavoriteItem {
  return {
    id: local.localId,
    message_id: local.messageId,
    created_at: local.favoritedAt,
    chat_messages: {
      id: local.messageId,
      content: local.content,
      role: local.role,
      created_at: local.createdAt,
    }
  }
}

export default function FavoritesPage() {
  const { user, isLoading: authLoading } = useAuth()
  const router = useRouter()
  
  const [favorites, setFavorites] = useState<FavoriteItem[]>([])
  const [isSyncing, setIsSyncing] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState(false)
  const hasLoadedRef = useRef(false)
  const isMountedRef = useRef(true)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      // Abort any pending requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth/login?redirectTo=/favorites")
    }
  }, [authLoading, user, router])

  // Set user ID for local storage
  useEffect(() => {
    if (user?.$id) {
      localFavoritesStorage.setUserId(user.$id)
    }
  }, [user?.$id])

  // Load local favorites immediately (no loading state)
  const loadLocalFavorites = useCallback(() => {
    const localFavorites = localFavoritesStorage.getFavorites()
    setFavorites(localFavorites.map(toFavoriteItem))
    console.log("📥 [Favorites] Loaded from localStorage:", localFavorites.length)
  }, [])

  // Fetch remote favorites and merge
  const fetchRemoteFavorites = useCallback(async () => {
    if (!user || !isMountedRef.current) return
    
    // Abort any previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()
    
    setIsSyncing(true)
    setLoadError(false)
    
    // Safety: Auto-stop syncing after 6 seconds no matter what
    const safetyTimeout = setTimeout(() => {
      if (isMountedRef.current) {
        console.warn("⚠️ [Favorites] Safety timeout reached, stopping sync")
        setIsSyncing(false)
      }
    }, 6000)
    
    try {
      const data = await Promise.race([
        chatService.getFavorites(),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error("Request timeout")), 5000)
        )
      ])
      
      // Check if still mounted before updating state
      if (!isMountedRef.current) return
      
      console.log("📡 [Favorites] Fetched from server:", data?.length || 0)
      
      // Merge with local storage
      if (data && Array.isArray(data)) {
        localFavoritesStorage.mergeRemoteFavorites(data)
        // Reload from local storage to get merged result
        if (isMountedRef.current) {
          loadLocalFavorites()
        }
      }
    } catch (err: any) {
      if (!isMountedRef.current) return
      console.warn("⚠️ [Favorites] Failed to fetch remote:", err.message)
      setLoadError(true)
      // Don't show toast on timeout - just use local data
    } finally {
      clearTimeout(safetyTimeout)
      if (isMountedRef.current) {
        setIsSyncing(false)
      }
    }
  }, [user, loadLocalFavorites])

  // Initial load: Local first, then sync with server
  useEffect(() => {
    if (!user || hasLoadedRef.current) return
    
    hasLoadedRef.current = true
    
    // 1. Load from localStorage immediately (no loading state)
    loadLocalFavorites()
    
    // 2. Fetch from server in background
    fetchRemoteFavorites()
  }, [user, loadLocalFavorites, fetchRemoteFavorites])

  // Subscribe to local storage events
  useEffect(() => {
    const unsubscribe = localFavoritesStorage.subscribe((event, data) => {
      if (event === 'favorite-added' || event === 'favorite-removed' || event === 'remote-merged') {
        loadLocalFavorites()
      }
    })
    
    return unsubscribe
  }, [loadLocalFavorites])

  // Force refresh data when page becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        loadLocalFavorites()
        if (loadError) {
          fetchRemoteFavorites()
        }
      }
    }

    const handleOnline = () => {
      if (loadError) {
        fetchRemoteFavorites()
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("online", handleOnline)

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("online", handleOnline)
    }
  }, [loadError, loadLocalFavorites, fetchRemoteFavorites])

  // Manual retry function
  const handleRetry = () => {
    hasLoadedRef.current = false
    setLoadError(false)
    fetchRemoteFavorites()
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

  const handleRemoveFavorite = async (messageId: string) => {
    // Local-first: Remove from localStorage immediately
    const removed = localFavoritesStorage.removeFavorite(messageId)
    if (removed) {
      toast.success("Removed from favorites")
      // Local storage will trigger sync with server in background
      // UI will update via the subscription
    } else {
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

  // Normalize/prepare content for markdown rendering. Kept simple here because
  // favorites currently store plain markdown/text. This mirrors the logic in
  // `components/chat/chat-feed.tsx` so images (including generated images)
  // render correctly.
  const normalizeContent = (content: any): string => {
    if (typeof content === "string") return content
    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part === "string") return part
          if (part && typeof part === "object") {
            const partObj: any = part
            if (partObj.type === "image" && partObj.image) {
              const imageUrl = typeof partObj.image === "string" ? partObj.image : partObj.image.url
              return `![${partObj.alt || "Image"}](${imageUrl})`
            }
            return partObj.text ?? partObj.value ?? ""
          }
          return ""
        })
        .join("\n\n")
    }
    return ""
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

  // No loading state for local-first! We always show data from localStorage immediately

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="container mx-auto max-w-4xl px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
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
                {isSyncing && (
                  <span className="ml-2 inline-flex items-center gap-1 text-blue-500">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Syncing...
                  </span>
                )}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRetry}
            className="rounded-full"
            disabled={isSyncing}
          >
            <RefreshCw className={cn("h-5 w-5", isSyncing && "animate-spin")} />
          </Button>
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

                      {/* Content (render markdown so images show correctly) */}
                      <div className="prose prose-sm max-w-none break-words dark:prose-invert [&_*]:break-words [&_pre]:whitespace-pre-wrap [&_code]:break-words">
                        {
                          (() => {
                            const normalizedContent = normalizeContent(favorite.chat_messages.content)

                            return (
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                  // Use the same generated-image rendering logic as chat-feed
                                  img: ({ src, alt }) => {
                                    const isGeneratedImage = alt?.includes("Generated image") || normalizedContent.includes("**Prompt:**")

                                    if (isGeneratedImage) {
                                      const GeneratedImage = require("@/components/chat/generated-image").GeneratedImage
                                      return (
                                        <GeneratedImage
                                          src={src || ""}
                                          alt={alt || ""}
                                          isPixel={false}
                                        />
                                      )
                                    }

                                    return (
                                      <img
                                        src={src}
                                        alt={alt}
                                        className={cn(
                                          "w-full h-auto my-3",
                                          "rounded-2xl border border-white/40 dark:border-white/10"
                                        )}
                                        loading="lazy"
                                      />
                                    )
                                  },
                                }}
                              >
                                {normalizedContent}
                              </ReactMarkdown>
                            )
                          })()
                        }
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
