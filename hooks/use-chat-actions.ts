"use client"

import { useCallback, useEffect, useState } from "react"
import { localChatStorage } from "@/lib/services/local-chat-storage"
import { localFavoritesStorage } from "@/lib/services/local-favorites-storage"
import { chatService } from "@/lib/supabase/chat-service"
import { MODES } from "@/lib/constants"
import type { Chat, Mode } from "@/types/chat"

export interface UseChatActionsReturn {
  allChats: Chat[]
  isLoadingAllChats: boolean
  setAllChats: React.Dispatch<React.SetStateAction<Chat[]>>
  handleNewChat: () => void
  handleSelectChat: (chatId: string) => Promise<void>
  handleDeleteChat: (chatId: string) => Promise<void>
  handleDeleteAllChats: () => void
  handleRenameChat: (chatId: string, title: string) => Promise<void>
  handleFavoriteChange: (messageId: string, isFavorite: boolean) => void
  handleProfileSelect: (profileId: string | null) => void
  refreshChats: () => Promise<void>
}

export function useChatActions(opts: {
  mode: Mode
  currentProfileId: string | null
  setCurrentProfileId: (id: string | null) => void
  persistenceEnabled: boolean
  currentChat: any
  clearCurrentChat: (() => void) | undefined
  loadChat: ((chatId: string) => any) | null
  loadPersistedMessages: (chatId?: string) => any
  getAllChats: (() => any) | null
  updateChatTitle: ((chatId: string, title: string) => void) | null
  setMode: (m: Mode) => void
  messages: any[]
  setMessages: (fn: any) => void
  setError: (e: string | null) => void
  clearSpeechError: () => void
  stopSpeaking: () => void
  toast: (opts: any) => void
  // Persistence tracking refs
  messagesByModeRef: React.MutableRefObject<Record<Mode, any[]>>
  currentModeRef: React.MutableRefObject<Mode>
  currentChatRef: React.MutableRefObject<any>
  hasLoadedRef: React.MutableRefObject<string | null>
  previousMessagesLengthRef: React.MutableRefObject<number>
  persistedMessageIdsRef: React.MutableRefObject<Set<string>>
}): UseChatActionsReturn {
  const {
    mode,
    currentProfileId,
    setCurrentProfileId,
    persistenceEnabled,
    currentChat,
    clearCurrentChat,
    loadChat,
    loadPersistedMessages,
    getAllChats,
    updateChatTitle,
    setMode,
    messages,
    setMessages,
    setError,
    clearSpeechError,
    stopSpeaking,
    toast,
    messagesByModeRef,
    currentModeRef,
    currentChatRef,
    hasLoadedRef,
    previousMessagesLengthRef,
    persistedMessageIdsRef,
  } = opts

  const [allChats, setAllChats] = useState<Chat[]>([])
  const [isLoadingAllChats, setIsLoadingAllChats] = useState(false)

  // ── Subscribe to local storage events ──
  useEffect(() => {
    const unsubscribe = localChatStorage.subscribe((event) => {
      if (
        (event === "chat-created" || event === "chat-synced" || event === "data-loaded") &&
        persistenceEnabled
      ) {
        const localChats = localChatStorage.getChats(mode, currentProfileId || undefined)
        setAllChats(localChats as Chat[])
      }
    })
    return unsubscribe
  }, [persistenceEnabled, mode, currentProfileId])

  // ── Load chats when mode / auth changes ──
  useEffect(() => {
    if (persistenceEnabled) {
      const localChats = localChatStorage.getChats(mode, currentProfileId || undefined)
      setAllChats(localChats)
      setIsLoadingAllChats(true)
      refreshChats()
        .catch((err) => console.log("Background chat refresh failed:", err?.message))
        .finally(() => setIsLoadingAllChats(false))
    } else {
      setAllChats([])
      setIsLoadingAllChats(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistenceEnabled, mode, currentProfileId])

  // ── Refresh on visibility ──
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && persistenceEnabled) {
        const localChats = localChatStorage.getChats(mode, currentProfileId || undefined)
        setAllChats(localChats)
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange)
  }, [persistenceEnabled, mode, currentProfileId])

  // ── Refresh all chats ──
  const refreshChats = useCallback(async () => {
    if (!persistenceEnabled) return

    try {
      setIsLoadingAllChats(true)
      const localChats = localChatStorage.getChats(mode, currentProfileId || undefined)
      setAllChats(localChats)

      if (getAllChats) {
        const safetyTimeout = setTimeout(() => setIsLoadingAllChats(false), 12000)
        try {
          const mergedChats = await getAllChats()
          clearTimeout(safetyTimeout)
          setAllChats(mergedChats || localChats)
        } catch {
          clearTimeout(safetyTimeout)
        }
      }

      const finalChats = localChatStorage.getChats(mode, currentProfileId || undefined)
      if (
        currentChat &&
        !finalChats.find(
          (c) => c.id === currentChat.id || c.localId === currentChat.localId,
        )
      ) {
        clearCurrentChat?.()
        setMessages([])
        messagesByModeRef.current[currentModeRef.current] = []
        hasLoadedRef.current = null
        previousMessagesLengthRef.current = 0
        persistedMessageIdsRef.current = new Set()
      }
    } catch (err) {
      console.error("Failed to refresh chats:", err)
      try {
        setAllChats(localChatStorage.getChats(mode, currentProfileId || undefined) || [])
      } catch {
        setAllChats([])
      }
    } finally {
      setIsLoadingAllChats(false)
    }
  }, [
    persistenceEnabled,
    getAllChats,
    currentChat,
    clearCurrentChat,
    setMessages,
    mode,
    currentProfileId,
    messagesByModeRef,
    currentModeRef,
    hasLoadedRef,
    previousMessagesLengthRef,
    persistedMessageIdsRef,
  ])

  // ── New chat ──
  const handleNewChat = useCallback(() => {
    setMessages([])
    messagesByModeRef.current[currentModeRef.current] = []
    setError(null)
    clearSpeechError()
    stopSpeaking()
    hasLoadedRef.current = null
    previousMessagesLengthRef.current = 0
    persistedMessageIdsRef.current = new Set()
    clearCurrentChat?.()
  }, [setMessages, setError, clearSpeechError, stopSpeaking, clearCurrentChat, messagesByModeRef, currentModeRef, hasLoadedRef, previousMessagesLengthRef, persistedMessageIdsRef])

  // ── Select chat ──
  const handleSelectChat = useCallback(
    async (chatId: string) => {
      if (!persistenceEnabled || !loadChat) return
      try {
        hasLoadedRef.current = null
        persistedMessageIdsRef.current = new Set()
        setMessages([])
        messagesByModeRef.current[currentModeRef.current] = []
        previousMessagesLengthRef.current = 0

        const chat = await loadChat(chatId)
        const targetMode = chat?.mode ? (chat.mode as Mode) : mode
        if (chat && chat.mode && chat.mode !== mode) setMode(targetMode)

        if (chat) {
          const savedMessages = await loadPersistedMessages(chat.id)
          const formattedMessages = savedMessages.map((msg: any) => ({
            id: msg.id,
            role: msg.role as "user" | "assistant" | "system",
            content: msg.content,
            createdAt: msg.createdAt ? new Date(msg.createdAt as string) : undefined,
            isFavorite: msg.isFavorite,
          }))
          setMessages(formattedMessages)
          messagesByModeRef.current[targetMode] = formattedMessages
          hasLoadedRef.current = chat.id
          previousMessagesLengthRef.current = formattedMessages.length
        }
      } catch (err) {
        console.error("Failed to load chat:", err)
      }
    },
    [persistenceEnabled, loadChat, loadPersistedMessages, setMessages, mode, setMode, messagesByModeRef, currentModeRef, hasLoadedRef, previousMessagesLengthRef, persistedMessageIdsRef],
  )

  // ── Delete chat ──
  const handleDeleteChat = useCallback(
    async (chatId: string) => {
      if (currentChat?.id === chatId || currentChat?.localId === chatId) {
        clearCurrentChat?.()
        setMessages([])
        messagesByModeRef.current[mode] = []
        hasLoadedRef.current = null
        previousMessagesLengthRef.current = 0
        persistedMessageIdsRef.current = new Set()
      }

      localChatStorage.deleteChat(chatId)
      setAllChats((prev) => prev.filter((c: any) => c.id !== chatId && c.localId !== chatId))
      chatService.deleteChat(chatId).catch((err) => {
        console.log("Background server delete failed:", err?.message)
      })
    },
    [currentChat, mode, clearCurrentChat, setMessages, messagesByModeRef, hasLoadedRef, previousMessagesLengthRef, persistedMessageIdsRef],
  )

  // ── Delete all chats ──
  const handleDeleteAllChats = useCallback(() => {
    clearCurrentChat?.()
    setMessages([])
    for (const modeKey of Object.keys(messagesByModeRef.current) as Mode[]) {
      messagesByModeRef.current[modeKey] = []
    }
    hasLoadedRef.current = null
    previousMessagesLengthRef.current = 0
    persistedMessageIdsRef.current = new Set()
    setAllChats([])
  }, [clearCurrentChat, setMessages, messagesByModeRef, hasLoadedRef, previousMessagesLengthRef, persistedMessageIdsRef])

  // ── Rename chat ──
  const handleRenameChat = useCallback(
    async (chatId: string, title: string) => {
      if (!persistenceEnabled) return
      try {
        try {
          await chatService.getChatById(chatId)
        } catch { /* ignore */ }

        const updated = await chatService.updateChat(chatId, { title })
        if (!updated) return

        updateChatTitle?.(chatId, updated.title)
        setAllChats((prev) =>
          prev.map((c) => (c.id === chatId ? { ...c, title: updated.title } : c)),
        )
        try {
          toast({ title: "Chat renamed", description: `Renamed to '${updated.title}'` })
        } catch { /* ignore */ }
      } catch (err) {
        console.error("Failed to rename chat", err)
        try {
          const message = err && (err as any).message ? (err as any).message : String(err)
          toast({ title: "Rename failed", description: message })
        } catch { /* ignore */ }
      }
    },
    [persistenceEnabled, updateChatTitle, toast],
  )

  // ── Favorite change ──
  const handleFavoriteChange = useCallback(
    (messageId: string, isFavorite: boolean) => {
      setMessages((prev: any[]) => {
        const next = prev.map((msg: any) =>
          msg.id === messageId ? { ...msg, isFavorite } : msg,
        )
        messagesByModeRef.current[currentModeRef.current] = next
        return next
      })

      localChatStorage.updateMessage(messageId, { isFavorite })

      if (isFavorite) {
        const message = messages.find((msg: any) => msg.id === messageId)
        if (message) {
          const localMessage = localChatStorage.getMessage(messageId)
          const chatId = currentChatRef.current?.id || currentChatRef.current?.localId
          const chatTitle = currentChatRef.current?.title
          localFavoritesStorage.addFavorite({
            messageId,
            remoteMessageId: localMessage?.remoteId,
            chatId: chatId || "",
            remoteChatId: localMessage?.remoteChatId,
            content:
              typeof message.content === "string"
                ? message.content
                : JSON.stringify(message.content),
            role: message.role as "user" | "assistant" | "system",
            mode: currentModeRef.current,
            chatTitle: chatTitle || `${MODES[currentModeRef.current]?.label || "General"} Chat`,
            createdAt: message.createdAt || new Date().toISOString(),
          })
        }
      } else {
        localFavoritesStorage.removeFavorite(messageId)
      }
    },
    [messages, setMessages, messagesByModeRef, currentModeRef, currentChatRef],
  )

  // ── Profile select ──
  const handleProfileSelect = useCallback(
    (profileId: string | null) => {
      setMessages([])
      messagesByModeRef.current[currentModeRef.current] = []
      hasLoadedRef.current = null
      previousMessagesLengthRef.current = 0
      persistedMessageIdsRef.current = new Set()
      setCurrentProfileId(profileId)
    },
    [setMessages, setCurrentProfileId, messagesByModeRef, currentModeRef, hasLoadedRef, previousMessagesLengthRef, persistedMessageIdsRef],
  )

  return {
    allChats,
    isLoadingAllChats,
    setAllChats,
    handleNewChat,
    handleSelectChat,
    handleDeleteChat,
    handleDeleteAllChats,
    handleRenameChat,
    handleFavoriteChange,
    handleProfileSelect,
    refreshChats,
  }
}
