"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { localChatStorage, LocalChat, LocalMessage as StorageMessage } from "@/lib/services/local-chat-storage"
import { localFavoritesStorage } from "@/lib/services/local-favorites-storage"
import { chatService } from "@/lib/appwrite/chat-service"
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
  const isMountedRef = useRef(true)
  
  // Cleanup on unmount - prevents state updates and cancels pending operations
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Set user ID for both local storages
  useEffect(() => {
    if (user?.$id) {
      localChatStorage.setUserId(user.$id)
      localFavoritesStorage.setUserId(user.$id)
    }
  }, [user?.$id])

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
    
    // Fetch remote chats in background with timeout protection
    fetchAndMergeRemoteChats()
  }, [isAuthenticated, user?.$id, mode, profileId])

  const fetchAndMergeRemoteChats = async () => {
    if (!isAuthenticated || !user || !isMountedRef.current) return
    
    // Use Promise.race with timeout to prevent hanging
    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => {
        console.log("⏰ fetchAndMergeRemoteChats timeout (5s) - using local data only")
        resolve(null)
      }, 5000)
    })
    
    try {
      const remoteChats = await Promise.race([
        chatService.getChats(mode, profileId),
        timeoutPromise
      ])
      
      // Check if still mounted before updating state
      if (!isMountedRef.current) return
      
      if (remoteChats && remoteChats.length > 0) {
        localChatStorage.mergeRemoteChats(remoteChats)
        if (!currentChat && isMountedRef.current) {
          const allChats = localChatStorage.getChats(mode, profileId)
          if (allChats.length > 0) {
            setCurrentChat(allChats[0])
          }
        }
      }
    } catch (err: any) {
      // Don't log abort/timeout errors as they're expected
      if (err?.name !== 'AbortError' && !err?.message?.includes('abort') && !err?.message?.includes('timeout')) {
        console.log("Could not fetch remote chats:", err?.message || err)
      }
    }
  }

  const loadMessages = useCallback(async (chatId?: string): Promise<LocalMessage[]> => {
    const targetChatId = chatId || currentChat?.localId || currentChat?.id
    if (!targetChatId) return []
    
    // 1. Get local messages immediately (Instant)
    const localMessages = localChatStorage.getMessagesForChat(targetChatId)
    const messages = localMessages.map(toLocalMessage)
    
    // 2. Trigger background refresh if we have a remote ID (Non-blocking)
    const remoteChatId = currentChat?.remoteId || chatId
    if (remoteChatId && !remoteChatId.startsWith("local_") && isAuthenticated && isMountedRef.current) {
      // Fire and forget - don't await this
      chatService.getMessages(remoteChatId)
        .then(remoteMessages => {
          if (remoteMessages.length > 0 && isMountedRef.current) {
            console.log(`☁️ Background fetched ${remoteMessages.length} messages for ${targetChatId}`)
            localChatStorage.mergeRemoteMessages(remoteChatId, remoteMessages)
            // Note: UI won't auto-update active chat messages unless we trigger a re-render
            // But this ensures next load has fresh data. 
            // Real-time updates should use subscriptions if needed.
          }
        })
        .catch(err => {
          // Silent failure for background sync is acceptable
          // console.warn("Background message sync failed:", err.message)
        })
    }
    
    return messages
  }, [currentChat?.localId, currentChat?.remoteId, currentChat?.id, isAuthenticated])

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
      user.$id
    )
    setCurrentChat(chat)
    return chat
  }, [mode, profileId, user?.$id])

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
    if (isAuthenticated && user && isMountedRef.current) {
      // Use Promise.race with timeout to prevent hanging
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => {
          console.log("⏰ getAllChats remote fetch timeout (5s)")
          resolve(null)
        }, 5000)
      })
      
      try {
        const remoteChats = await Promise.race([
          chatService.getChats(mode, profileId),
          timeoutPromise
        ])
        
        // Check if still mounted before updating
        if (!isMountedRef.current) return chats
        
        if (remoteChats && remoteChats.length > 0) {
          console.log(`☁️ Got ${remoteChats.length} remote chats, merging...`)
          localChatStorage.mergeRemoteChats(remoteChats)
          // Return the merged result
          chats = localChatStorage.getChats(mode, profileId)
          console.log(`✅ After merge: ${chats.length} total chats`)
        } else {
          console.log("☁️ No remote chats found or timeout")
        }
      } catch (fetchErr: any) {
        // Don't log abort/timeout errors as they're expected
        if (fetchErr?.name !== 'AbortError' && !fetchErr?.message?.includes('abort') && !fetchErr?.message?.includes('timeout')) {
          console.log("Could not fetch remote chats:", fetchErr?.message || fetchErr)
        }
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
