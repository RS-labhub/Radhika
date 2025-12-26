/**
 * Message Queue Service
 * 
 * This service provides a resilient message storage system that:
 * 1. Stores messages in memory for immediate access
 * 2. Persists failed messages to localStorage for browser refresh recovery
 * 3. Automatically retries saving failed messages to Supabase
 * 4. Syncs queued messages when connection is restored
 */

import { chatService } from "@/lib/supabase/chat-service"

export interface QueuedMessage {
  id: string
  chatId: string
  role: "user" | "assistant" | "system"
  content: string
  metadata?: Record<string, any>
  messageId?: string // Original message ID if exists
  timestamp: number
  retryCount: number
  lastRetryAt?: number
  error?: string
}

export interface QueuedChat {
  id: string
  mode: string
  title: string
  profileId?: string
  timestamp: number
  retryCount: number
  lastRetryAt?: number
  error?: string
  createdChatId?: string // The ID returned from Supabase once created
}

const STORAGE_KEY = "radhika-message-queue"
const CHAT_QUEUE_STORAGE_KEY = "radhika-chat-queue"
const MAX_RETRIES = 5
const INITIAL_RETRY_DELAY = 5000 // 5 seconds
const MAX_RETRY_DELAY = 60000 // 1 minute
const SYNC_INTERVAL = 30000 // Check every 30 seconds

type QueueEventType = "message-queued" | "message-saved" | "message-failed" | "chat-queued" | "chat-created" | "chat-failed" | "sync-started" | "sync-completed"
type QueueEventCallback = (event: QueueEventType, data?: any) => void

class MessageQueueService {
  private messageQueue: Map<string, QueuedMessage> = new Map()
  private chatQueue: Map<string, QueuedChat> = new Map()
  private syncIntervalId: NodeJS.Timeout | null = null
  private isSyncing = false
  private eventListeners: Set<QueueEventCallback> = new Set()
  private initialized = false

  constructor() {
    // Initialize on first use
    if (typeof window !== "undefined") {
      this.initialize()
    }
  }

  private initialize() {
    if (this.initialized) return
    this.initialized = true
    
    // Load from localStorage
    this.loadFromStorage()
    
    // Start background sync
    this.startBackgroundSync()
    
    // Listen for online events to trigger sync
    window.addEventListener("online", () => {
      console.log("🌐 Network restored, syncing message queue...")
      this.syncNow()
    })
    
    // Attempt to sync when page becomes visible
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && this.hasQueuedItems()) {
        console.log("👁️ Page visible, syncing message queue...")
        this.syncNow()
      }
    })
    
    // Save to storage before page unload
    window.addEventListener("beforeunload", () => {
      this.saveToStorage()
    })
  }

  // Event subscription
  subscribe(callback: QueueEventCallback): () => void {
    this.eventListeners.add(callback)
    return () => this.eventListeners.delete(callback)
  }

  private emit(event: QueueEventType, data?: any) {
    this.eventListeners.forEach(callback => {
      try {
        callback(event, data)
      } catch (err) {
        console.error("Queue event listener error:", err)
      }
    })
  }

  // Load queued items from localStorage
  private loadFromStorage() {
    try {
      const savedMessages = localStorage.getItem(STORAGE_KEY)
      if (savedMessages) {
        const parsed = JSON.parse(savedMessages) as QueuedMessage[]
        parsed.forEach(msg => {
          this.messageQueue.set(msg.id, msg)
        })
        console.log(`📥 Loaded ${parsed.length} queued messages from storage`)
      }
      
      const savedChats = localStorage.getItem(CHAT_QUEUE_STORAGE_KEY)
      if (savedChats) {
        const parsed = JSON.parse(savedChats) as QueuedChat[]
        parsed.forEach(chat => {
          this.chatQueue.set(chat.id, chat)
        })
        console.log(`📥 Loaded ${parsed.length} queued chats from storage`)
      }
    } catch (err) {
      console.error("Failed to load message queue from storage:", err)
    }
  }

  // Save queued items to localStorage
  private saveToStorage() {
    try {
      const messages = Array.from(this.messageQueue.values())
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
      
      const chats = Array.from(this.chatQueue.values())
      localStorage.setItem(CHAT_QUEUE_STORAGE_KEY, JSON.stringify(chats))
    } catch (err) {
      console.error("Failed to save message queue to storage:", err)
    }
  }

  // Start background sync process
  private startBackgroundSync() {
    if (this.syncIntervalId) return
    
    this.syncIntervalId = setInterval(() => {
      if (this.hasQueuedItems()) {
        this.syncNow()
      }
    }, SYNC_INTERVAL)
  }

  // Stop background sync
  stopBackgroundSync() {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId)
      this.syncIntervalId = null
    }
  }

  // Check if there are items in the queue
  hasQueuedItems(): boolean {
    return this.messageQueue.size > 0 || this.chatQueue.size > 0
  }

  // Get queue status
  getQueueStatus() {
    return {
      messageCount: this.messageQueue.size,
      chatCount: this.chatQueue.size,
      isSyncing: this.isSyncing,
      messages: Array.from(this.messageQueue.values()),
      chats: Array.from(this.chatQueue.values()),
    }
  }

  // Queue a message for saving
  queueMessage(
    chatId: string,
    role: "user" | "assistant" | "system",
    content: string,
    metadata?: Record<string, any>,
    messageId?: string,
    error?: string
  ): string {
    const queueId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    const queuedMessage: QueuedMessage = {
      id: queueId,
      chatId,
      role,
      content,
      metadata,
      messageId,
      timestamp: Date.now(),
      retryCount: 0,
      error,
    }
    
    this.messageQueue.set(queueId, queuedMessage)
    this.saveToStorage()
    this.emit("message-queued", queuedMessage)
    
    console.log(`📝 Message queued: ${queueId} for chat ${chatId}`)
    
    // Try to sync immediately if online
    if (navigator.onLine) {
      setTimeout(() => this.syncNow(), 1000)
    }
    
    return queueId
  }

  // Queue a chat for creation
  queueChat(
    mode: string,
    title: string,
    profileId?: string,
    error?: string
  ): string {
    const queueId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    const queuedChat: QueuedChat = {
      id: queueId,
      mode,
      title,
      profileId,
      timestamp: Date.now(),
      retryCount: 0,
      error,
    }
    
    this.chatQueue.set(queueId, queuedChat)
    this.saveToStorage()
    this.emit("chat-queued", queuedChat)
    
    console.log(`📝 Chat queued: ${queueId}`)
    
    // Try to sync immediately if online
    if (navigator.onLine) {
      setTimeout(() => this.syncNow(), 1000)
    }
    
    return queueId
  }

  // Calculate retry delay with exponential backoff
  private getRetryDelay(retryCount: number): number {
    const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount)
    return Math.min(delay, MAX_RETRY_DELAY)
  }

  // Sync all queued items
  async syncNow(): Promise<void> {
    if (this.isSyncing) {
      console.log("⏳ Sync already in progress, skipping...")
      return
    }
    
    if (!this.hasQueuedItems()) {
      return
    }
    
    this.isSyncing = true
    this.emit("sync-started")
    console.log("🔄 Starting message queue sync...")
    
    try {
      // First, sync chats (messages depend on chats existing)
      await this.syncChats()
      
      // Then sync messages
      await this.syncMessages()
      
      this.saveToStorage()
      this.emit("sync-completed", this.getQueueStatus())
      console.log("✅ Message queue sync completed")
    } catch (err) {
      console.error("❌ Message queue sync failed:", err)
    } finally {
      this.isSyncing = false
    }
  }

  // Sync queued chats
  private async syncChats(): Promise<void> {
    const chats = Array.from(this.chatQueue.values())
    
    for (const queuedChat of chats) {
      // Skip if max retries exceeded
      if (queuedChat.retryCount >= MAX_RETRIES) {
        console.warn(`⚠️ Chat ${queuedChat.id} exceeded max retries, removing from queue`)
        this.chatQueue.delete(queuedChat.id)
        this.emit("chat-failed", queuedChat)
        continue
      }
      
      // Check if enough time has passed since last retry
      const retryDelay = this.getRetryDelay(queuedChat.retryCount)
      if (queuedChat.lastRetryAt && Date.now() - queuedChat.lastRetryAt < retryDelay) {
        continue
      }
      
      try {
        console.log(`🔄 Retrying chat creation: ${queuedChat.id} (attempt ${queuedChat.retryCount + 1})`)
        
        const createdChat = await chatService.createChat(
          queuedChat.mode,
          queuedChat.title,
          queuedChat.profileId
        )
        
        // Success! Remove from queue and store the created chat ID
        queuedChat.createdChatId = createdChat.id
        this.chatQueue.delete(queuedChat.id)
        this.emit("chat-created", { queuedChat, createdChat })
        console.log(`✅ Queued chat saved successfully: ${queuedChat.id} -> ${createdChat.id}`)
        
      } catch (err: any) {
        queuedChat.retryCount++
        queuedChat.lastRetryAt = Date.now()
        queuedChat.error = err?.message || "Unknown error"
        
        console.error(`❌ Failed to save queued chat ${queuedChat.id}:`, err)
      }
    }
  }

  // Sync queued messages
  private async syncMessages(): Promise<void> {
    const messages = Array.from(this.messageQueue.values())
    
    for (const queuedMessage of messages) {
      // Skip if max retries exceeded
      if (queuedMessage.retryCount >= MAX_RETRIES) {
        console.warn(`⚠️ Message ${queuedMessage.id} exceeded max retries, removing from queue`)
        this.messageQueue.delete(queuedMessage.id)
        this.emit("message-failed", queuedMessage)
        continue
      }
      
      // Check if enough time has passed since last retry
      const retryDelay = this.getRetryDelay(queuedMessage.retryCount)
      if (queuedMessage.lastRetryAt && Date.now() - queuedMessage.lastRetryAt < retryDelay) {
        continue
      }
      
      try {
        console.log(`🔄 Retrying message save: ${queuedMessage.id} (attempt ${queuedMessage.retryCount + 1})`)
        
        await chatService.addMessage(
          queuedMessage.chatId,
          queuedMessage.role,
          queuedMessage.content,
          queuedMessage.metadata,
          queuedMessage.messageId
        )
        
        // Success! Remove from queue
        this.messageQueue.delete(queuedMessage.id)
        this.emit("message-saved", queuedMessage)
        console.log(`✅ Queued message saved successfully: ${queuedMessage.id}`)
        
      } catch (err: any) {
        queuedMessage.retryCount++
        queuedMessage.lastRetryAt = Date.now()
        queuedMessage.error = err?.message || "Unknown error"
        
        console.error(`❌ Failed to save queued message ${queuedMessage.id}:`, err)
      }
    }
  }

  // Remove a specific message from the queue
  removeMessage(queueId: string) {
    this.messageQueue.delete(queueId)
    this.saveToStorage()
  }

  // Remove a specific chat from the queue
  removeChat(queueId: string) {
    this.chatQueue.delete(queueId)
    this.saveToStorage()
  }

  // Clear all queued items
  clearAll() {
    this.messageQueue.clear()
    this.chatQueue.clear()
    this.saveToStorage()
    console.log("🗑️ Message queue cleared")
  }

  // Get pending messages for a specific chat
  getPendingMessagesForChat(chatId: string): QueuedMessage[] {
    return Array.from(this.messageQueue.values())
      .filter(msg => msg.chatId === chatId)
      .sort((a, b) => a.timestamp - b.timestamp)
  }
}

// Export singleton instance
export const messageQueueService = new MessageQueueService()
