"use client"

import { useState, useEffect, useCallback } from "react"
import { chatService } from "@/lib/supabase/chat-service"
import type { Chat, Mode } from "@/types/chat"
import { useAuth } from "@/contexts/auth-context"
import { getPendingMessages } from "@/lib/supabase/pending-messages"

export interface LocalMessage {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  createdAt?: Date | string | number
  metadata?: Record<string, any>
  isFavorite?: boolean
}

const MESSAGE_LOAD_LIMIT = 200

export function useChatPersistence(mode: Mode, profileId?: string) {
  const { user, isAuthenticated } = useAuth()
  const [currentChat, setCurrentChat] = useState<Chat | null>(null)
  const [isLoadingChat, setIsLoadingChat] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [hasAttemptedLoad, setHasAttemptedLoad] = useState(false)

  // Create or load chat when mode or profile changes
  useEffect(() => {
    if (!isAuthenticated || !user) {
      setCurrentChat(null)
      setHasAttemptedLoad(false)
      setIsLoadingChat(false)
      return
    }

    // Reset flag when mode or profile changes
    setHasAttemptedLoad(false)
    setCurrentChat(null) // Clear current chat when switching modes or profiles
    // Don't auto-create a chat - let user send first message to create it
  }, [isAuthenticated, user, mode, profileId])
  
  useEffect(() => {
    // Don't block app startup - just mark as ready
    if (!isAuthenticated || !user || hasAttemptedLoad) return

    setHasAttemptedLoad(true)
    setIsLoadingChat(false) // Not loading, just ready
    
    // Try to load existing chat in background (optional, silent failure)
    // Only auto-load if there are existing chats, don't create new ones
    const loadTimer = setTimeout(() => {
      loadExistingChat()
        .then(() => {
          console.log("Background chat load completed")
        })
        .catch(err => {
          console.log("Could not load existing chat:", err.message)
          // No chat exists or timeout - this is OK, user will create one on first message
        })
        .finally(() => {
          setIsLoadingChat(false)
        })
    }, 1000) // Delay by 1 second to not interfere with page load

    // Cleanup timeout on unmount
    return () => clearTimeout(loadTimer)
  }, [isAuthenticated, user, hasAttemptedLoad])

  const loadExistingChat = async () => {
    if (!user) {
      console.log("No user found, skipping chat load")
      return
    }

    try {
      setIsLoadingChat(true)
      
      console.log("Loading chats for mode:", mode, "profile:", profileId)
      
      // Try to get existing chats for this mode/profile with a limit for performance
      // Load only the 20 most recent chats initially
      const chats = await chatService.getChats(mode, profileId, 20)
      
      console.log("Found chats:", chats.length)
      
      if (chats.length > 0) {
        // Use the most recent chat
        setCurrentChat(chats[0])
        console.log("Loaded existing chat:", chats[0].id)
      } else {
        setCurrentChat(null)
      }
    } catch (err: any) {
      console.error("Failed to load chat:", err)
      // Don't throw - just set to null so user can still use the app
      setCurrentChat(null)
      // Show more helpful error message
      if (err.message?.includes('timeout')) {
        console.warn("Chat loading timed out. You can still create new chats.")
      }
    } finally {
      setIsLoadingChat(false)
    }
  }

  // Load messages for current chat
  const loadMessages = useCallback(async (chatId?: string): Promise<LocalMessage[]> => {
    const targetChatId = chatId || currentChat?.id
    if (!targetChatId || !isAuthenticated) {
      return []
    }

    try {
      const messages = await chatService.getMessages(targetChatId, { limit: MESSAGE_LOAD_LIMIT })
      const persistedClientIds = new Set(
        messages
          .map((msg) => (msg.metadata as any)?.client_id as string | undefined)
          .filter((id): id is string => Boolean(id))
      )

      const pending = getPendingMessages(targetChatId, user?.id).filter((msg) => !persistedClientIds.has(msg.id))
      const pendingMessages: LocalMessage[] = pending.map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        createdAt: msg.createdAt,
        metadata: msg.metadata || undefined,
      }))

      const persistedMessages: LocalMessage[] = messages.map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        createdAt: msg.created_at,
        metadata: msg.metadata,
        isFavorite: Boolean((msg as any).is_favorite),
      }))
      
      return [...persistedMessages, ...pendingMessages].sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt as any).getTime() : 0
        const tb = b.createdAt ? new Date(b.createdAt as any).getTime() : 0
        return ta - tb
      })
    } catch (err) {
      console.error("Failed to load messages:", err)
      const pending = getPendingMessages(targetChatId, user?.id)
      return pending.map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        createdAt: msg.createdAt,
        metadata: msg.metadata || undefined,
      }))
    }
  }, [currentChat?.id, isAuthenticated, user?.id])

  // Save messages to database
  const saveMessages = useCallback(async (messages: LocalMessage[]) => {
    if (!currentChat || !isAuthenticated) {
      return
    }

    try {
      setIsSaving(true)
      await chatService.saveChatHistory(
        currentChat.id,
        messages.map(msg => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          metadata: msg.metadata,
        }))
      )
    } catch (err) {
      console.error("Failed to save messages:", err)
    } finally {
      setIsSaving(false)
    }
  }, [currentChat, isAuthenticated])

  // Add a single message
  const addMessage = useCallback(async (message: LocalMessage) => {
    if (!currentChat || !isAuthenticated) {
      return undefined
    }

    try {
      return await chatService.addMessage(
        currentChat.id,
        message.role,
        message.content,
        message.metadata,
        message.id
      )
    } catch (err) {
      console.error("Failed to add message:", err)
      return undefined
    }
  }, [currentChat?.id, isAuthenticated])

  // Create a new chat (for starting fresh conversation)
  const createNewChat = useCallback(async (title?: string) => {
    if (!isAuthenticated) return

    try {
      const newChat = await chatService.createChat(
        mode,
        title || `${mode.charAt(0).toUpperCase() + mode.slice(1)} Chat`,
        profileId
      )
      setCurrentChat(newChat)
      return newChat
    } catch (err) {
      console.error("Failed to create new chat:", err)
    }
  }, [isAuthenticated, mode, profileId])

  const clearCurrentChat = useCallback(() => {
    setCurrentChat(null)
  }, [])

  // Load a specific chat by ID
  const loadChat = useCallback(async (chatId: string) => {
    if (!isAuthenticated) return

    try {
      const chat = await chatService.getChatById(chatId)
      setCurrentChat(chat)
      return chat
    } catch (err) {
      console.error("Failed to load chat:", err)
    }
  }, [isAuthenticated])

  // Get all chats for current mode
  const getAllChats = useCallback(async () => {
    if (!isAuthenticated) return []

    try {
      // Fetch chats for the current mode and profile
      // This ensures we only show chats relevant to the current context
      return await chatService.getChats(mode, profileId)
    } catch (err: any) {
      console.error("Failed to get chats:", err)
      // Return empty array instead of throwing to prevent blocking the UI
      // Log the specific error for debugging
      if (err.message?.includes('timeout')) {
        console.warn("Chat loading timed out - this may indicate a slow connection or large dataset")
      }
      return []
    }
  }, [isAuthenticated, mode, profileId])

  useEffect(() => {
    if (!isAuthenticated) return

    let cancelled = false
    const flush = async () => {
      try {
        await chatService.flushPendingMessages(currentChat?.id)
      } catch (err) {
        if (!cancelled) {
          console.warn("Failed to flush pending messages:", err)
        }
      }
    }

    flush()

    const intervalId = setInterval(() => {
      flush()
    }, 15000)

    const handleOnline = () => flush()
    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      window.addEventListener("online", handleOnline)
    }

    return () => {
      cancelled = true
      clearInterval(intervalId)
      if (typeof window !== "undefined" && typeof window.removeEventListener === "function") {
        window.removeEventListener("online", handleOnline)
      }
    }
  }, [isAuthenticated, currentChat?.id])

  return {
    currentChat,
    isLoadingChat,
    isSaving,
    loadMessages,
    saveMessages,
    addMessage,
    createNewChat,
    loadChat,
    getAllChats,
    clearCurrentChat,
    isEnabled: isAuthenticated,
  }
}
