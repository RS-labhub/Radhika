"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { localChatStorage, LocalChat, LocalMessage as StorageMessage } from "@/lib/services/local-chat-storage"
import { localFavoritesStorage } from "@/lib/services/local-favorites-storage"
import { chatService } from "@/lib/supabase/chat-service"
import type { Mode } from "@/types/chat"
import { useAuth } from "@/contexts/auth-context"

export interface LocalMessage {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  createdAt?: Date | string | number
  metadata?: Record<string, any>
  isFavorite?: boolean
  isPending?: boolean
  syncStatus?: "pending" | "synced" | "failed"
}

function toLocalMessage(msg: StorageMessage): LocalMessage {
  return {
    id: msg.id,
    role: msg.role,
    content: msg.content,
    createdAt: msg.createdAt,
    metadata: msg.metadata,
    isFavorite: msg.isFavorite,
    isPending: msg.syncStatus !== "synced",
    syncStatus: msg.syncStatus,
  }
}

export function useChatPersistence(mode: Mode, profileId?: string) {
  const { user, isAuthenticated } = useAuth()
  const [currentChat, setCurrentChat] = useState<LocalChat | null>(null)
  const [isLoadingChat, setIsLoadingChat] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [syncStats, setSyncStats] = useState({ pending: 0, failed: 0 })
  const hasInitialized = useRef(false)
  const lastModeRef = useRef<string | null>(null)
  const lastProfileRef = useRef<string | undefined>(undefined)

  // Set user ID for both local storages
  useEffect(() => {
    if (user?.id) {
      localChatStorage.setUserId(user.id)
      localFavoritesStorage.setUserId(user.id)
    }
  }, [user?.id])

  useEffect(() => {
    const unsubscribe = localChatStorage.subscribe((event, data) => {
      const stats = localChatStorage.getStats()
      setSyncStats({
        pending: stats.pendingChats + stats.pendingMessages,
        failed: stats.failedChats + stats.failedMessages,
      })
      if (event === "chat-synced" && currentChat && data?.localId === currentChat.localId) {
        setCurrentChat({ ...data })
      }
    })
    return unsubscribe
  }, [currentChat?.localId])

  useEffect(() => {
    if (!isAuthenticated || !user) {
      setCurrentChat(null)
      hasInitialized.current = false
      return
    }
    if (hasInitialized.current && lastModeRef.current === mode && lastProfileRef.current === profileId) {
      return
    }
    hasInitialized.current = true
    lastModeRef.current = mode
    lastProfileRef.current = profileId

    // DON'T auto-load an existing chat - this causes messages to go to the wrong chat
    // Users should explicitly select a chat from history or start a new one
    // Just ensure localStorage has the data ready
    const localChats = localChatStorage.getChats(mode, profileId)
    console.log(`📚 [useChatPersistence] Found ${localChats.length} local chats for mode=${mode}`)
    
    // Only set currentChat if we're continuing an ACTIVE session (not navigating back)
    // The chat should be null initially - user will either:
    // 1. Start typing (auto-creates a new chat)
    // 2. Select an existing chat from history
    setCurrentChat(null)
    
    // Fetch remote chats in background
    fetchAndMergeRemoteChats()
  }, [isAuthenticated, user?.id, mode, profileId])

  const fetchAndMergeRemoteChats = async () => {
    if (!isAuthenticated || !user) return
    try {
      const remoteChats = await chatService.getChats(mode, profileId)
      if (remoteChats.length > 0) {
        localChatStorage.mergeRemoteChats(remoteChats)
        if (!currentChat) {
          const allChats = localChatStorage.getChats(mode, profileId)
          if (allChats.length > 0) {
            setCurrentChat(allChats[0])
          }
        }
      }
    } catch (err) {
      console.log("Could not fetch remote chats:", (err as Error).message)
    }
  }

  const loadMessages = useCallback(async (chatId?: string): Promise<LocalMessage[]> => {
    const targetChatId = chatId || currentChat?.localId || currentChat?.id
    if (!targetChatId) return []
    const localMessages = localChatStorage.getMessagesForChat(targetChatId)
    const messages = localMessages.map(toLocalMessage)
    const remoteChatId = currentChat?.remoteId || chatId
    if (remoteChatId && !remoteChatId.startsWith("local_")) {
      try {
        const remoteMessages = await chatService.getMessages(remoteChatId)
        if (remoteMessages.length > 0) {
          localChatStorage.mergeRemoteMessages(remoteChatId, remoteMessages)
          return localChatStorage.getMessagesForChat(targetChatId).map(toLocalMessage)
        }
      } catch (err) {
        console.log("Could not fetch remote messages:", (err as Error).message)
      }
    }
    return messages
  }, [currentChat?.localId, currentChat?.remoteId, currentChat?.id])

  const addMessage = useCallback((message: LocalMessage): StorageMessage | undefined => {
    const chatId = currentChat?.localId || currentChat?.id
    if (!chatId) return undefined
    return localChatStorage.addMessage(chatId, message.role, message.content, message.metadata, message.id)
  }, [currentChat?.localId, currentChat?.id])

  const createNewChat = useCallback((title?: string): LocalChat | undefined => {
    if (!user) return undefined
    const chat = localChatStorage.createChat(
      mode,
      title || mode.charAt(0).toUpperCase() + mode.slice(1) + " Chat",
      profileId,
      user.id
    )
    setCurrentChat(chat)
    return chat
  }, [mode, profileId, user?.id])

  const getOrCreateChat = useCallback((title?: string): LocalChat | undefined => {
    if (currentChat) return currentChat
    return createNewChat(title)
  }, [currentChat, createNewChat])

  const clearCurrentChat = useCallback(() => setCurrentChat(null), [])

  const loadChat = useCallback((chatId: string): LocalChat | undefined => {
    const chat = localChatStorage.getChat(chatId)
    if (chat) { setCurrentChat(chat); return chat }
    if (!chatId.startsWith("local_")) {
      chatService.getChatById(chatId).then(remoteChat => {
        localChatStorage.mergeRemoteChats([remoteChat])
        const lc = localChatStorage.getChat(chatId)
        if (lc) setCurrentChat(lc)
      }).catch(() => {})
    }
    return undefined
  }, [])

  const getAllChats = useCallback(async () => {
    // First get local chats immediately - this ALWAYS works
    let chats = localChatStorage.getChats(mode, profileId)
    console.log(`📚 getAllChats: Found ${chats.length} local chats for mode=${mode}`)
    
    // Then try to fetch and merge remote chats (with timeout)
    if (isAuthenticated && user) {
      try {
        // Create an AbortController for this specific request
        const controller = new AbortController()
        const timeoutId = setTimeout(() => {
          console.log("⏰ Remote fetch timeout - aborting")
          controller.abort()
        }, 8000) // 8 second timeout
        
        try {
          const remoteChats = await chatService.getChats(mode, profileId)
          clearTimeout(timeoutId)
          
          if (remoteChats && remoteChats.length > 0) {
            console.log(`☁️ Got ${remoteChats.length} remote chats, merging...`)
            localChatStorage.mergeRemoteChats(remoteChats)
            // Return the merged result
            chats = localChatStorage.getChats(mode, profileId)
            console.log(`✅ After merge: ${chats.length} total chats`)
          } else {
            console.log("☁️ No remote chats found")
          }
        } catch (fetchErr: any) {
          clearTimeout(timeoutId)
          // Don't log abort errors as they're expected on timeout
          if (fetchErr?.name !== 'AbortError' && !fetchErr?.message?.includes('abort')) {
            console.log("Could not fetch remote chats:", fetchErr?.message || fetchErr)
          }
        }
      } catch (outerErr) {
        console.log("Error in remote fetch setup:", outerErr)
      }
    }
    
    // ALWAYS return local chats, even if remote fetch failed
    return chats
  }, [mode, profileId, isAuthenticated, user])
  const getAllChatsGlobal = useCallback(() => localChatStorage.getAllChats(), [])
  const syncNow = useCallback(async () => { setIsSaving(true); try { await localChatStorage.syncNow() } finally { setIsSaving(false) } }, [])
  const retryFailed = useCallback(() => localChatStorage.retryFailed(), [])
  const getStats = useCallback(() => localChatStorage.getStats(), [])
  const updateChatTitle = useCallback((chatId: string, title: string) => {
    localChatStorage.updateChat(chatId, { title })
    if (currentChat && (currentChat.localId === chatId || currentChat.id === chatId)) {
      setCurrentChat(prev => prev ? { ...prev, title } : null)
    }
  }, [currentChat])
  const deleteChat = useCallback((chatId: string) => {
    localChatStorage.deleteChat(chatId)
    if (currentChat && (currentChat.localId === chatId || currentChat.id === chatId)) setCurrentChat(null)
  }, [currentChat])
  const deleteAllChats = useCallback(() => {
    localChatStorage.deleteAllChats()
    setCurrentChat(null)
  }, [])
  const saveMessages = useCallback(async () => {}, [])
  const getPendingMessages = useCallback(() => {
    const chatId = currentChat?.localId || currentChat?.id
    if (!chatId) return []
    return localChatStorage.getMessagesForChat(chatId).filter(m => m.syncStatus === "pending")
  }, [currentChat?.localId, currentChat?.id])
  const getQueueStatus = useCallback(() => {
    const stats = localChatStorage.getStats()
    return { messageCount: stats.pendingMessages, chatCount: stats.pendingChats, isSyncing: stats.isSyncing }
  }, [])
  const subscribeToQueue = useCallback((cb: (e: string, d?: any) => void) => localChatStorage.subscribe(cb as any), [])

  return {
    currentChat, isLoadingChat, isSaving, loadMessages, saveMessages, addMessage, createNewChat, getOrCreateChat,
    loadChat, getAllChats, getAllChatsGlobal, clearCurrentChat, updateChatTitle, deleteChat, deleteAllChats, isEnabled: isAuthenticated,
    syncNow, retryFailed, getStats, syncStats, getPendingMessages, getQueueStatus, syncQueue: syncNow, subscribeToQueue,
  }
}
