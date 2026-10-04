"use client"

import { useCallback, useEffect, useRef } from "react"
import { localChatStorage } from "@/lib/services/local-chat-storage"
import { normalizeContentForStorage } from "@/lib/chat/normalize-content"
import type { Mode, Provider } from "@/types/chat"

/**
 * Tracks which messages have been persisted and handles syncing messages to
 * localStorage + Supabase via the persistence hook.
 */
export interface UsePersistenceSyncReturn {
  persistedMessageIdsRef: React.MutableRefObject<Set<string>>
  isCreatingChatRef: React.MutableRefObject<boolean>
  isRestoringRef: React.MutableRefObject<boolean>
  hasLoadedRef: React.MutableRefObject<string | null>
  previousMessagesLengthRef: React.MutableRefObject<number>
  previousIsLoadingRef: React.MutableRefObject<boolean>
  currentChatRef: React.MutableRefObject<any>
  persistenceEnabledRef: React.MutableRefObject<boolean>
  messagesByModeRef: React.MutableRefObject<Record<Mode, any[]>>
  currentModeRef: React.MutableRefObject<Mode>
  chatIdByModeRef: React.MutableRefObject<Partial<Record<Mode, string | null>>>
  persistAssistantMessage: (msg: any, chat: any) => boolean
  resetPersistenceTracking: () => void
}

export function usePersistenceSync(opts: {
  mode: Mode
  provider: Provider
  resolveModel: (p: Provider) => string
  messages: any[]
  setMessages: (fn: any) => void
  isLoading: boolean
  persistenceEnabled: boolean
  currentChat: any
  loadPersistedMessages: (chatId?: string) => any
  createNewChat: ((...args: any[]) => any) | null
  setAllChats: (fn: any) => void
}): UsePersistenceSyncReturn {
  const {
    mode,
    provider,
    resolveModel,
    messages,
    setMessages,
    isLoading,
    persistenceEnabled,
    currentChat,
    loadPersistedMessages,
    createNewChat,
    setAllChats,
  } = opts

  const persistedMessageIdsRef = useRef<Set<string>>(new Set())
  const isCreatingChatRef = useRef(false)
  const isRestoringRef = useRef(false)
  const hasLoadedRef = useRef<string | null>(null)
  const previousMessagesLengthRef = useRef(0)
  const previousIsLoadingRef = useRef(false)
  const currentChatRef = useRef(currentChat)
  const persistenceEnabledRef = useRef(persistenceEnabled)
  const currentModeRef = useRef<Mode>(mode)
  const chatIdByModeRef = useRef<Partial<Record<Mode, string | null>>>({})

  const messagesByModeRef = useRef<Record<Mode, any[]>>({
    general: [],
    productivity: [],
    wellness: [],
    learning: [],
    creative: [],
    bff: [],
  })

  // Keep refs updated
  currentModeRef.current = mode
  useEffect(() => {
    currentChatRef.current = currentChat
    persistenceEnabledRef.current = persistenceEnabled
    if (currentChat) {
      chatIdByModeRef.current[mode] = currentChat.id || currentChat.localId || null
    }
  }, [currentChat, persistenceEnabled, mode])

  // Sync messages to mode ref
  useEffect(() => {
    messagesByModeRef.current[currentModeRef.current] = [...messages]
  }, [messages])

  // ── Load persisted messages when chat becomes available ──
  useEffect(() => {
    const loadPersistedChat = async () => {
      if (
        !persistenceEnabled ||
        !currentChat ||
        hasLoadedRef.current === currentChat.id ||
        !loadPersistedMessages
      )
        return

      try {
        isRestoringRef.current = true
        persistedMessageIdsRef.current = new Set()
        const savedMessages = await loadPersistedMessages()
        const formattedMessages = savedMessages.map((msg: any) => ({
          id: msg.id,
          role: msg.role as "user" | "assistant" | "system",
          content: msg.content,
          createdAt: msg.createdAt ? new Date(msg.createdAt as string) : undefined,
          isFavorite: msg.isFavorite,
        }))

        for (const msg of savedMessages) {
          if (msg.id) persistedMessageIdsRef.current.add(msg.id)
        }

        const localMessages = messagesByModeRef.current[mode] ?? messages ?? []
        const map = new Map<string, any>()
        for (const m of formattedMessages) {
          if (m?.id) map.set(m.id, m)
        }
        for (const lm of localMessages) {
          if (lm?.id) map.set(lm.id, { ...map.get(lm.id), ...lm })
        }

        const merged = Array.from(map.values()).sort((a: any, b: any) => {
          const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0
          const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0
          return ta - tb
        })

        setMessages(merged)
        messagesByModeRef.current[mode] = merged
        hasLoadedRef.current = currentChat.id
        previousMessagesLengthRef.current = merged.length
        isRestoringRef.current = false
      } catch (err) {
        console.error("Failed to load persisted messages:", err)
        isRestoringRef.current = false
      }
    }

    loadPersistedChat()
  }, [persistenceEnabled, currentChat, loadPersistedMessages, setMessages, mode, messages])

  // Reset load flag when mode changes
  useEffect(() => {
    hasLoadedRef.current = null
  }, [mode])

  // ── Persist new user messages ──
  useEffect(() => {
    const chat = currentChatRef.current || currentChat
    if (!persistenceEnabled || !chat || messages.length === 0) return
    if (isRestoringRef.current) {
      previousMessagesLengthRef.current = messages.length
      isRestoringRef.current = false
      return
    }
    if (isCreatingChatRef.current) return
    if (messages.length <= previousMessagesLengthRef.current) {
      previousMessagesLengthRef.current = messages.length
      return
    }

    const newMessages = messages.slice(previousMessagesLengthRef.current)
    for (const msg of newMessages) {
      if (!msg?.id) continue
      const normalizedContent = normalizeContentForStorage(msg.content)
      if (!normalizedContent.trim()) continue
      if (persistedMessageIdsRef.current.has(msg.id)) continue

      if (msg.role === "user") {
        const chatId = chat.localId || chat.id
        try {
          const messageMetadata = msg.metadata || {
            provider,
            model: resolveModel(provider),
            mode,
            timestamp: new Date().toISOString(),
          }
          localChatStorage.addMessage(chatId, msg.role, normalizedContent, messageMetadata, msg.id)
          persistedMessageIdsRef.current.add(msg.id)
        } catch (err) {
          console.error("❌ Failed to persist user message:", err)
        }
      }
    }
    previousMessagesLengthRef.current = messages.length
  }, [messages, persistenceEnabled, currentChat, provider, resolveModel, mode])

  // ── Helper to persist a single assistant message ──
  const persistAssistantMessage = useCallback(
    (assistantMessage: any, chat: any): boolean => {
      if (!assistantMessage?.id || !chat) return false
      if (persistedMessageIdsRef.current.has(assistantMessage.id)) return false

      const normalizedContent = normalizeContentForStorage(assistantMessage.content)
      if (!normalizedContent.trim()) return false

      const chatId = chat.localId || chat.id
      try {
        const messageMetadata = assistantMessage.metadata || {
          provider,
          model: resolveModel(provider),
          mode,
          timestamp: new Date().toISOString(),
        }
        localChatStorage.addMessage(chatId, "assistant", normalizedContent, messageMetadata, assistantMessage.id)
        persistedMessageIdsRef.current.add(assistantMessage.id)
        return true
      } catch (err) {
        console.error("❌ Failed to persist assistant message:", assistantMessage.id, err)
        return false
      }
    },
    [provider, resolveModel, mode],
  )

  // ── Persist assistant messages when streaming completes ──
  useEffect(() => {
    if (previousIsLoadingRef.current && !isLoading) {
      const assistantMessages = messages.filter((m: any) => m.role === "assistant")
      for (const assistantMessage of assistantMessages) {
        const chat = currentChatRef.current || currentChat
        if (!persistenceEnabled || !chat) continue
        persistAssistantMessage(assistantMessage, chat)
      }
    }
    previousIsLoadingRef.current = isLoading
  }, [isLoading, persistenceEnabled, currentChat, messages, persistAssistantMessage])

  // ── Safety net: check for unpersisted assistant messages ──
  useEffect(() => {
    if (!persistenceEnabled || isLoading) return
    const chat = currentChatRef.current || currentChat
    if (!chat) return

    const unpersistedAssistant = messages.filter((m: any) => {
      if (m.role !== "assistant" || !m.id) return false
      if (persistedMessageIdsRef.current.has(m.id)) return false
      const normalized = normalizeContentForStorage(m.content)
      if (!normalized.trim()) return false
      if (
        normalized.includes("_Generating image") ||
        normalized.includes("_Regenerating image") ||
        normalized.includes("Image generation cancelled")
      )
        return false
      return true
    })

    if (unpersistedAssistant.length > 0) {
      const timer = setTimeout(() => {
        for (const msg of unpersistedAssistant) {
          persistAssistantMessage(msg, currentChatRef.current || currentChat)
        }
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [messages, isLoading, persistenceEnabled, currentChat, persistAssistantMessage])

  // ── Auto-create chat session after first message ──
  useEffect(() => {
    if (!persistenceEnabled || currentChat || !createNewChat) return
    if (messages.length === 0) return
    if (isRestoringRef.current || isCreatingChatRef.current) return

    isCreatingChatRef.current = true
    const pendingMessages = messagesByModeRef.current[currentModeRef.current] ?? messages.slice()
    previousMessagesLengthRef.current = messages.length

    ;(async () => {
      try {
        const newChat = await createNewChat()
        if (newChat) {
          hasLoadedRef.current = newChat.id

          setAllChats((prev: any[]) => {
            const exists = prev.some(
              (c: any) => c.id === newChat.id || c.localId === newChat.localId,
            )
            return exists ? prev : [newChat, ...prev]
          })

          for (const msg of pendingMessages) {
            if (!msg?.id || persistedMessageIdsRef.current.has(msg.id)) continue
            const normalized = normalizeContentForStorage(msg.content)
            if (!normalized.trim()) continue
            try {
              const chatId = newChat.localId || newChat.id
              localChatStorage.addMessage(chatId, msg.role, normalized, msg.metadata, msg.id)
              persistedMessageIdsRef.current.add(msg.id)
            } catch (err) {
              console.error("Failed to persist pending message:", err)
            }
          }
        }
      } catch (err) {
        console.error("❌ Failed to auto-create chat:", err)
      } finally {
        isCreatingChatRef.current = false
      }
    })()
  }, [messages.length, persistenceEnabled, currentChat, createNewChat, setAllChats])

  const resetPersistenceTracking = useCallback(() => {
    hasLoadedRef.current = null
    previousMessagesLengthRef.current = 0
    persistedMessageIdsRef.current = new Set()
  }, [])

  return {
    persistedMessageIdsRef,
    isCreatingChatRef,
    isRestoringRef,
    hasLoadedRef,
    previousMessagesLengthRef,
    previousIsLoadingRef,
    currentChatRef,
    persistenceEnabledRef,
    messagesByModeRef,
    currentModeRef,
    chatIdByModeRef,
    persistAssistantMessage,
    resetPersistenceTracking,
  }
}
