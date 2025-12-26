"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { MessageSquare, Trash2, Clock, Loader2, Pencil, Share2 } from "lucide-react"
import type { Chat } from "@/types/chat"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { chatService } from "@/lib/supabase/chat-service"
import { localChatStorage } from "@/lib/services/local-chat-storage"

interface ChatHistorySidebarProps {
  chats: Chat[]
  currentChatId?: string
  onSelectChat: (chatId: string) => void
  onDeleteChat?: (chatId: string) => void
  onDeleteAllChats?: () => void
  onRenameChat?: (chatId: string, title: string) => void
  onRefresh?: () => void
  isLoading?: boolean
}

export function ChatHistorySidebar({
  chats,
  currentChatId,
  onSelectChat,
  onDeleteChat,
  onDeleteAllChats,
  onRefresh,
  onRenameChat,
  isLoading = false
}: ChatHistorySidebarProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [chatToDelete, setChatToDelete] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false)
  const [sharingChatId, setSharingChatId] = useState<string | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)

  // Deduplicate chats by ID - safety measure to prevent duplicate key errors
  const uniqueChats = chats.reduce((acc, chat) => {
    // Check if we already have a chat with this ID
    if (!acc.find(c => c.id === chat.id)) {
      acc.push(chat)
    }
    return acc
  }, [] as Chat[])

  const handleShareClick = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSharingChatId(chatId)
    
    try {
      const chat = chats.find(c => c.id === chatId)
      
      if (chat?.share_token) {
        // Already shared, show existing URL
        const url = `${window.location.origin}/share/${chat.share_token}`
        setShareUrl(url)
        await navigator.clipboard.writeText(url)
        alert('Share link copied to clipboard!')
      } else {
        // Generate new share token
        const token = await chatService.shareChat(chatId)
        const url = `${window.location.origin}/share/${token}`
        setShareUrl(url)
        await navigator.clipboard.writeText(url)
        alert('Share link created and copied to clipboard!')
        onRefresh?.()
      }
    } catch (err) {
      console.error('Failed to share chat:', err)
      alert('Failed to create share link')
    } finally {
      setSharingChatId(null)
    }
  }

  const handleDeleteClick = (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setChatToDelete(chatId)
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!chatToDelete) return

    try {
      setIsDeleting(true)
      // Delete from localStorage first (always works)
      localChatStorage.deleteChat(chatToDelete)
      // Then try to delete from Supabase (may fail, but local is already gone)
      try {
        await chatService.deleteChat(chatToDelete)
      } catch (err) {
        console.log("Could not delete from Supabase:", err)
      }
      onDeleteChat?.(chatToDelete)
      onRefresh?.()
    } catch (err) {
      console.error("Failed to delete chat:", err)
    } finally {
      setIsDeleting(false)
      setDeleteDialogOpen(false)
      setChatToDelete(null)
    }
  }

  const handleDeleteAll = async () => {
    try {
      setIsDeleting(true)
      // Delete from localStorage first (always works)
      localChatStorage.deleteAllChats()
      // Then try to delete from Supabase (may fail, but local is already gone)
      try {
        await chatService.deleteAllChats()
      } catch (err) {
        console.log("Could not delete all from Supabase:", err)
      }
      onDeleteAllChats?.()
      onRefresh?.()
    } catch (err) {
      console.error("Failed to delete all chats:", err)
    } finally {
      setIsDeleting(false)
      setDeleteAllDialogOpen(false)
    }
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return "Unknown"
    
    const date = new Date(dateString)
    if (isNaN(date.getTime())) return "Invalid date"
    
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return "Just now"
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays === 0) return "Today"
    if (diffDays === 1) return "Yesterday"
    if (diffDays < 7) return `${diffDays}d ago`
    
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: now.getFullYear() !== date.getFullYear() ? "numeric" : undefined
    })
  }

  const truncateTitle = (title: string, maxLength = 30) => {
    if (title.length <= maxLength) return title
    return title.slice(0, maxLength) + "..."
  }

  return (
    <>
      <div className="flex h-full flex-col">
        <div className="border-b border-slate-200 p-4 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Chat History
            </h3>
              <div className="flex items-center gap-2">
                {onRefresh && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onRefresh}
                    disabled={isLoading}
                    className="h-7 px-2 text-xs"
                  >
                    {isLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      "Refresh"
                    )}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteAllDialogOpen(true)}
                  disabled={isLoading || uniqueChats.length === 0}
                  className="h-7 px-2 text-xs text-red-600 hover:text-red-700 dark:text-red-300"
                >
                  Delete All
                </Button>
              </div>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {uniqueChats.length} {uniqueChats.length === 1 ? "conversation" : "conversations"}
          </p>
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-1 p-2">
            {isLoading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : uniqueChats.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <MessageSquare className="mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No conversations yet
                </p>
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                  Start chatting to see history
                </p>
              </div>
            ) : (
              uniqueChats.map((chat) => {
                const isActive = chat.id === currentChatId
                return (
                  <div
                    key={chat.id}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-lg border p-3 transition-all duration-150",
                      isActive
                        ? "border-blue-200 bg-blue-50 dark:border-blue-800/50 dark:bg-blue-950/30"
                        : "border-transparent bg-slate-50 hover:border-slate-200 hover:bg-white dark:bg-slate-800/50 dark:hover:border-slate-700 dark:hover:bg-slate-800"
                    )}
                  >
                    <button
                      onClick={() => onSelectChat(chat.id)}
                      className="flex flex-1 items-start gap-3 text-left"
                    >
                      <MessageSquare
                        className={cn(
                          "mt-0.5 h-4 w-4 shrink-0",
                          isActive
                            ? "text-blue-600 dark:text-blue-400"
                            : "text-slate-400 dark:text-slate-500"
                        )}
                      />
                      <div className="flex-1 space-y-1">
                        {onRenameChat ? (
                          <div className="group/rename relative flex items-center gap-1">
                            <input
                              defaultValue={chat.title}
                              onClick={(e) => e.stopPropagation()}
                              onMouseDown={(e) => e.stopPropagation()}
                              onBlur={(e) => {
                                const next = e.target.value.trim()
                                if (next && next !== chat.title) onRenameChat(chat.id, next)
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault()
                                  const next = e.currentTarget.value.trim()
                                  if (next && next !== chat.title) onRenameChat(chat.id, next)
                                  e.currentTarget.blur()
                                }
                                if (e.key === "Escape") {
                                  e.preventDefault()
                                  e.currentTarget.value = chat.title
                                  e.currentTarget.blur()
                                }
                              }}
                              className={cn(
                                "w-full rounded-md border px-2 py-0.5 text-sm font-medium transition-colors",
                                "hover:border-blue-300 dark:hover:border-blue-600",
                                "focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-400",
                                "dark:focus:border-blue-500 dark:focus:bg-slate-800 dark:focus:ring-blue-500",
                                isActive
                                  ? "border-blue-200 bg-blue-50/50 text-blue-900 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-100"
                                  : "border-slate-200 bg-slate-50 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100",
                              )}
                              aria-label="Rename chat"
                            />
                            <Pencil className="h-3 w-3 shrink-0 text-slate-400 opacity-60 group-hover/rename:opacity-100 dark:text-slate-500" />
                          </div>
                        ) : (
                          <p
                            className={cn(
                              "text-sm font-medium",
                              isActive
                                ? "text-blue-900 dark:text-blue-100"
                                : "text-slate-900 dark:text-slate-100"
                            )}
                          >
                            {truncateTitle(chat.title)}
                          </p>
                        )}
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="secondary"
                            className={cn(
                              "text-[10px] font-medium",
                              isActive
                                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
                                : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                            )}
                          >
                            {chat.mode}
                          </Badge>
                          <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                            <Clock className="h-3 w-3" />
                            {formatDate(chat.last_message_at || chat.created_at)}
                          </span>
                        </div>
                      </div>
                    </button>
                    
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => handleShareClick(chat.id, e)}
                        disabled={sharingChatId === chat.id}
                        className={cn(
                          "h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100",
                          isActive && "opacity-100",
                          chat.is_public && "text-blue-500"
                        )}
                        title={chat.is_public ? "Already shared - click to copy link" : "Share chat"}
                      >
                        {sharingChatId === chat.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Share2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      {onDeleteChat && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => handleDeleteClick(chat.id, e)}
                          className={cn(
                            "h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100",
                            isActive && "opacity-100"
                          )}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-500" />
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </ScrollArea>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this conversation and all its messages.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteAllDialogOpen} onOpenChange={setDeleteAllDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all conversations?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all chats and messages. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAll}
              disabled={isDeleting}
              className="bg-red-700 text-white hover:bg-red-800"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete all"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
