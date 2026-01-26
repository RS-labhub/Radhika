/**
 * Local-First Chat Storage Service
 * 
 * This service implements a local-first approach where:
 * 1. ALL chats and messages are stored in localStorage FIRST
 * 2. Sync to Appwrite happens in the background (non-blocking)
 * 3. Chat history is always available from localStorage
 * 4. No loading states that block the UI
 * 5. Graceful merge when Appwrite data becomes available
 */

import type { Chat, ChatMessage, Mode } from '@/types/chat'

export interface LocalChat {
  // Required fields from Chat type
  id: string
  user_id: string
  profile_id?: string
  mode: Mode
  title: string
  created_at: string
  updated_at: string
  last_message_at?: string
  is_archived: boolean
  is_public?: boolean
  share_token?: string
  shared_at?: string
  
  // Local-first specific fields
  localId: string // Always present, used for localStorage key
  remoteId?: string // Appwrite ID once synced
  syncStatus: 'pending' | 'synced' | 'failed'
  syncError?: string
  lastSyncAt?: string
}

export interface LocalMessage {
  id: string
  localId: string // Always present
  remoteId?: string // Appwrite ID once synced
  chatId: string // References LocalChat.localId
  remoteChatId?: string // Appwrite chat ID
  role: 'user' | 'assistant' | 'system'
  content: string
  metadata?: Record<string, any>
  createdAt: string
  isFavorite: boolean
  syncStatus: 'pending' | 'synced' | 'failed'
  syncError?: string
  lastSyncAt?: string
}

// Convert LocalChat to Chat type for compatibility
export function toChat(local: LocalChat): Chat {
  return {
    id: local.remoteId || local.id,
    user_id: local.user_id,
    profile_id: local.profile_id,
    mode: local.mode,
    title: local.title,
    created_at: local.created_at,
    updated_at: local.updated_at,
    last_message_at: local.last_message_at,
    is_archived: local.is_archived,
    is_public: local.is_public,
    share_token: local.share_token,
    shared_at: local.shared_at,
  }
}

interface SyncQueueItem {
  type: 'chat' | 'message'
  localId: string
  retryCount: number
  lastRetryAt?: number
}

const CHATS_STORAGE_KEY = 'radhika-local-chats'
const MESSAGES_STORAGE_KEY = 'radhika-local-messages'
const SYNC_QUEUE_KEY = 'radhika-sync-queue'
const DELETED_CHATS_KEY = 'radhika-deleted-chats' // Track deleted chats to prevent re-merge
const MAX_RETRIES = 10
const SYNC_INTERVAL = 15000 // 15 seconds
const INITIAL_RETRY_DELAY = 2000
const MAX_RETRY_DELAY = 120000 // 2 minutes

type EventType = 
  | 'chat-created' 
  | 'chat-updated' 
  | 'chat-synced' 
  | 'chat-sync-failed'
  | 'chat-deleted'
  | 'all-chats-deleted'
  | 'message-created'
  | 'message-updated'
  | 'message-synced'
  | 'message-sync-failed'
  | 'sync-started'
  | 'sync-completed'
  | 'data-loaded'

type EventCallback = (event: EventType, data?: any) => void

class LocalChatStorageService {
  private chats: Map<string, LocalChat> = new Map()
  private messages: Map<string, LocalMessage> = new Map()
  private syncQueue: Map<string, SyncQueueItem> = new Map()
  private deletedChatIds: Set<string> = new Set() // Track deleted chats to prevent re-merge
  private eventListeners: Set<EventCallback> = new Set()
  private syncIntervalId: NodeJS.Timeout | null = null
  private isSyncing = false
  private initialized = false
  private currentUserId: string | null = null

  constructor() {
    if (typeof window !== 'undefined') {
      this.initialize()
    }
  }

  private saveTimeout: NodeJS.Timeout | null = null
  private readonly SAVE_DELAY = 1000 // 1 second debounce

  private initialize() {
    if (this.initialized) return
    this.initialized = true

    this.loadFromStorage()
    this.startBackgroundSync()

    // Sync when online
    window.addEventListener('online', () => {
      console.log('🌐 Online - triggering sync')
      this.syncNow()
    })

    // Sync when tab becomes visible
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        console.log('👁️ Tab visible - triggering sync')
        this.syncNow()
      }
    })

    // Save before unload (immediate save)
    window.addEventListener('beforeunload', () => {
      this.saveToStorage(true)
    })
    
    // NO interval here - we save on mutation with debounce
  }

  // Set current user ID (call this when user logs in)
  setUserId(userId: string) {
    if (this.currentUserId !== userId) {
      // Clear in-memory cache when user changes
      this.chats.clear()
      this.messages.clear()
      this.syncQueue.clear()
      this.deletedChatIds.clear()
      
      this.currentUserId = userId
      this.loadFromStorage() // Reload for this user
      console.log(`👤 Switched to user ${userId}, loaded their data`)
    }
  }

  // Clear user data (call this when user logs out)
  clearCurrentUser() {
    this.chats.clear()
    this.messages.clear()
    this.syncQueue.clear()
    this.deletedChatIds.clear()
    this.currentUserId = null
    console.log('👤 Cleared current user data')
  }

  // Subscribe to events
  subscribe(callback: EventCallback): () => void {
    this.eventListeners.add(callback)
    return () => this.eventListeners.delete(callback)
  }

  private emit(event: EventType, data?: any) {
    this.eventListeners.forEach(cb => {
      try { cb(event, data) } catch (e) { console.error('Event listener error:', e) }
    })
  }

  // ============ Storage ============
  
  private getStorageKey(base: string): string {
    return this.currentUserId ? `${base}-${this.currentUserId}` : base
  }

  private loadFromStorage() {
    try {
      // Load chats
      const chatsJson = localStorage.getItem(this.getStorageKey(CHATS_STORAGE_KEY))
      if (chatsJson) {
        const chatsArray: LocalChat[] = JSON.parse(chatsJson)
        this.chats.clear()
        chatsArray.forEach(chat => this.chats.set(chat.localId, chat))
        console.log(`📥 Loaded ${chatsArray.length} chats from localStorage`)
      }

      // Load messages
      const messagesJson = localStorage.getItem(this.getStorageKey(MESSAGES_STORAGE_KEY))
      if (messagesJson) {
        const messagesArray: LocalMessage[] = JSON.parse(messagesJson)
        this.messages.clear()
        messagesArray.forEach(msg => this.messages.set(msg.localId, msg))
        console.log(`📥 Loaded ${messagesArray.length} messages from localStorage`)
      }

      // Load sync queue
      const queueJson = localStorage.getItem(this.getStorageKey(SYNC_QUEUE_KEY))
      if (queueJson) {
        const queueArray: SyncQueueItem[] = JSON.parse(queueJson)
        this.syncQueue.clear()
        queueArray.forEach(item => this.syncQueue.set(item.localId, item))
        console.log(`📥 Loaded ${queueArray.length} items in sync queue`)
      }

      // Load deleted chat IDs (prevents re-merging deleted chats)
      const deletedJson = localStorage.getItem(this.getStorageKey(DELETED_CHATS_KEY))
      if (deletedJson) {
        const deletedArray: string[] = JSON.parse(deletedJson)
        this.deletedChatIds.clear()
        deletedArray.forEach(id => this.deletedChatIds.add(id))
        console.log(`📥 Loaded ${deletedArray.length} deleted chat IDs`)
      }

      this.emit('data-loaded', { 
        chatCount: this.chats.size, 
        messageCount: this.messages.size,
        pendingSync: this.syncQueue.size
      })
    } catch (err) {
      console.error('Failed to load from localStorage:', err)
    }
  }

  // Saves to storage with debounce
  // pass force=true to save immediately (e.g. beforeunload)
  saveToStorage(force = false) {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout)
      this.saveTimeout = null
    }

    const doSave = () => {
      try {
        console.log('💾 Saving to localStorage...')
        const start = performance.now()
        
        localStorage.setItem(
          this.getStorageKey(CHATS_STORAGE_KEY),
          JSON.stringify(Array.from(this.chats.values()))
        )
        // This is potentially large - eventually we should chunk usage
        localStorage.setItem(
          this.getStorageKey(MESSAGES_STORAGE_KEY),
          JSON.stringify(Array.from(this.messages.values()))
        )
        localStorage.setItem(
          this.getStorageKey(SYNC_QUEUE_KEY),
          JSON.stringify(Array.from(this.syncQueue.values()))
        )
        // Save deleted chat IDs (prevents re-merging)
        localStorage.setItem(
          this.getStorageKey(DELETED_CHATS_KEY),
          JSON.stringify(Array.from(this.deletedChatIds))
        )
        
        const end = performance.now()
        if (end - start > 50) {
          console.warn(`⚠️ Slow storage save: ${(end - start).toFixed(2)}ms`)
        }
      } catch (err) {
        console.error('Failed to save to localStorage:', err)
      }
    }

    if (force) {
      doSave()
    } else {
      this.saveTimeout = setTimeout(doSave, this.SAVE_DELAY)
    }
  }

  // ============ Chat Operations ============

  createChat(mode: string, title: string, profileId?: string, userId?: string): LocalChat {
    const now = new Date().toISOString()
    const localId = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    const chat: LocalChat = {
      id: localId, // Use localId as primary ID until synced
      localId,
      user_id: userId || this.currentUserId || 'anonymous',
      mode: mode as Mode,
      title,
      profile_id: profileId,
      last_message_at: now,
      is_archived: false,
      created_at: now,
      updated_at: now,
      syncStatus: 'pending',
    }

    this.chats.set(localId, chat)
    this.addToSyncQueue('chat', localId)
    this.saveToStorage()
    this.emit('chat-created', chat)
    
    console.log(`💬 Created local chat: ${localId}`)
    
    // Trigger background sync
    setTimeout(() => this.syncNow(), 100)
    
    return chat
  }

  getChat(chatId: string): LocalChat | undefined {
    // Try by localId first, then by remoteId
    let chat = this.chats.get(chatId)
    if (!chat) {
      chat = Array.from(this.chats.values()).find(c => c.remoteId === chatId)
    }
    return chat
  }

  getChats(mode?: string, profileId?: string): LocalChat[] {
    let chats = Array.from(this.chats.values())
    
    if (mode) {
      chats = chats.filter(c => c.mode === mode)
    }
    if (profileId) {
      chats = chats.filter(c => c.profile_id === profileId)
    }
    
    // Sort by last_message_at descending
    return chats.sort((a, b) => 
      new Date(b.last_message_at || b.created_at).getTime() - new Date(a.last_message_at || a.created_at).getTime()
    )
  }

  getAllChats(): LocalChat[] {
    return Array.from(this.chats.values()).sort((a, b) => 
      new Date(b.last_message_at || b.created_at).getTime() - new Date(a.last_message_at || a.created_at).getTime()
    )
  }

  updateChat(chatId: string, updates: Partial<LocalChat>): LocalChat | undefined {
    const chat = this.getChat(chatId)
    if (!chat) return undefined

    const updatedChat: LocalChat = {
      ...chat,
      ...updates,
      updated_at: new Date().toISOString(),
      syncStatus: 'pending',
    }

    this.chats.set(chat.localId, updatedChat)
    this.addToSyncQueue('chat', chat.localId)
    this.saveToStorage()
    this.emit('chat-updated', updatedChat)

    return updatedChat
  }

  deleteChat(chatId: string): boolean {
    const chat = this.getChat(chatId)
    if (!chat) return false

    // Store remoteId before deletion for remote sync
    const remoteId = chat.remoteId

    // Add to deleted list to prevent re-merge (both local and remote IDs)
    this.deletedChatIds.add(chat.localId)
    if (remoteId) {
      this.deletedChatIds.add(remoteId)
    }

    // Delete all messages for this chat from local storage
    const chatMessages = this.getMessagesForChat(chat.localId)
    chatMessages.forEach(msg => {
      this.messages.delete(msg.localId)
      this.syncQueue.delete(msg.localId)
    })

    // Delete the chat from local storage
    this.chats.delete(chat.localId)
    this.syncQueue.delete(chat.localId)
    this.saveToStorage()
    
    this.emit('chat-deleted', { chatId, localId: chat.localId, remoteId })
    
    console.log(`🗑️ Deleted local chat: ${chat.localId}${remoteId ? ` (remote: ${remoteId})` : ''}`)

    // Trigger remote deletion in background if the chat was synced
    if (remoteId) {
      this.deleteRemoteChat(remoteId).catch(err => {
        console.warn('Failed to delete chat from remote:', err)
      })
    }

    return true
  }

  /**
   * Delete a chat from the remote database
   */
  private async deleteRemoteChat(remoteId: string): Promise<void> {
    try {
      const { chatService } = await import('@/lib/appwrite/chat-service')
      await chatService.deleteChat(remoteId)
      console.log(`☁️ Deleted remote chat: ${remoteId}`)
    } catch (err: any) {
      // Don't throw - local deletion should still succeed
      console.warn(`Failed to delete remote chat ${remoteId}:`, err?.message)
    }
  }

  /**
   * Delete all chats for the current user
   */
  deleteAllChats(): void {
    if (!this.currentUserId) return

    // Get all chats for this user
    const userChats = Array.from(this.chats.values()).filter(c => c.user_id === this.currentUserId)
    
    // Collect remote IDs for background deletion
    const remoteIds = userChats
      .filter(chat => chat.remoteId)
      .map(chat => chat.remoteId as string)
    
    for (const chat of userChats) {
      // Delete all messages for this chat
      const chatMessages = this.getMessagesForChat(chat.localId)
      chatMessages.forEach(msg => {
        this.messages.delete(msg.localId)
        this.syncQueue.delete(msg.localId)
      })
      
      // Delete the chat
      this.chats.delete(chat.localId)
      this.syncQueue.delete(chat.localId)
    }
    
    this.saveToStorage()
    this.emit('all-chats-deleted', { count: userChats.length })
    
    console.log(`🗑️ Deleted ${userChats.length} local chats`)
    
    // Trigger remote deletion in background
    if (remoteIds.length > 0) {
      this.deleteAllRemoteChats().catch(err => {
        console.warn('Failed to delete all chats from remote:', err)
      })
    }
  }

  /**
   * Delete all chats from the remote database
   */
  private async deleteAllRemoteChats(): Promise<void> {
    try {
      const { chatService } = await import('@/lib/appwrite/chat-service')
      await chatService.deleteAllChats()
      console.log('☁️ Deleted all remote chats')
    } catch (err: any) {
      console.warn('Failed to delete all remote chats:', err?.message)
    }
  }

  // ============ Message Operations ============

  addMessage(
    chatId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    metadata?: Record<string, any>,
    messageId?: string
  ): LocalMessage {
    // Check if message with this ID already exists to prevent duplicates
    if (messageId) {
      const existingById = this.messages.get(messageId)
      if (existingById) {
        console.log(`⏭️ Message ${messageId} already exists, skipping duplicate`)
        return existingById
      }
      // Also check by remoteId
      const existingByRemoteId = Array.from(this.messages.values()).find(m => m.remoteId === messageId || m.id === messageId)
      if (existingByRemoteId) {
        console.log(`⏭️ Message ${messageId} already exists (by remoteId), skipping duplicate`)
        return existingByRemoteId
      }
    }

    const chat = this.getChat(chatId)
    const now = new Date().toISOString()
    const localId = messageId || `local_msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const message: LocalMessage = {
      id: localId,
      localId,
      chatId: chat?.localId || chatId,
      remoteChatId: chat?.remoteId,
      role,
      content,
      metadata,
      createdAt: now,
      isFavorite: false,
      syncStatus: 'pending',
    }

    this.messages.set(localId, message)
    this.addToSyncQueue('message', localId)

    // Update chat's last_message_at
    if (chat) {
      chat.last_message_at = now
      chat.updated_at = now
      this.chats.set(chat.localId, chat)
    }

    this.saveToStorage()
    this.emit('message-created', message)

    console.log(`📝 Created local message: ${localId} for chat ${chatId}`)

    // Trigger background sync
    setTimeout(() => this.syncNow(), 100)

    return message
  }

  getMessage(messageId: string): LocalMessage | undefined {
    let msg = this.messages.get(messageId)
    if (!msg) {
      msg = Array.from(this.messages.values()).find(m => m.remoteId === messageId)
    }
    return msg
  }

  getMessagesForChat(chatId: string): LocalMessage[] {
    const chat = this.getChat(chatId)
    const targetChatId = chat?.localId || chatId

    return Array.from(this.messages.values())
      .filter(m => m.chatId === targetChatId || m.remoteChatId === chatId)
      .sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0
        if (ta !== tb) return ta - tb
        // Secondary sort by localId to ensure stability
        return a.localId.localeCompare(b.localId)
      })
  }

  updateMessage(messageId: string, updates: Partial<LocalMessage>): LocalMessage | undefined {
    const msg = this.getMessage(messageId)
    if (!msg) return undefined

    const updatedMsg: LocalMessage = {
      ...msg,
      ...updates,
      // Only mark as pending if this is a new message (no remoteId)
      // For existing messages, changes like isFavorite are synced via localFavoritesStorage
      syncStatus: msg.remoteId ? 'synced' : 'pending',
    }

    this.messages.set(msg.localId, updatedMsg)
    
    // Only queue for sync if it's a new message without remoteId
    if (!msg.remoteId) {
      this.addToSyncQueue('message', msg.localId)
    }
    
    this.saveToStorage()
    this.emit('message-updated', updatedMsg)

    return updatedMsg
  }

  // ============ Sync Operations ============

  private addToSyncQueue(type: 'chat' | 'message', localId: string) {
    if (!this.syncQueue.has(localId)) {
      this.syncQueue.set(localId, {
        type,
        localId,
        retryCount: 0,
      })
    }
  }

  private startBackgroundSync() {
    if (this.syncIntervalId) return

    this.syncIntervalId = setInterval(() => {
      if (this.syncQueue.size > 0) {
        this.syncNow()
      }
    }, SYNC_INTERVAL)
  }

  async syncNow(): Promise<void> {
    if (this.isSyncing || !navigator.onLine) return
    if (this.syncQueue.size === 0) return

    this.isSyncing = true
    this.emit('sync-started', { pendingCount: this.syncQueue.size })
    console.log(`🔄 Starting sync... (${this.syncQueue.size} items pending)`)

    try {
      // Import chatService dynamically to avoid circular deps
      const { chatService } = await import('@/lib/appwrite/chat-service')

      // Sync chats first (messages depend on chats)
      const chatItems = Array.from(this.syncQueue.values()).filter(i => i.type === 'chat')
      for (const item of chatItems) {
        await this.syncChat(item, chatService)
      }

      // Then sync messages
      const messageItems = Array.from(this.syncQueue.values()).filter(i => i.type === 'message')
      for (const item of messageItems) {
        await this.syncMessage(item, chatService)
      }

      this.saveToStorage()
      this.emit('sync-completed', { 
        remaining: this.syncQueue.size,
        synced: chatItems.length + messageItems.length - this.syncQueue.size
      })
      console.log(`✅ Sync completed. ${this.syncQueue.size} items still pending.`)
    } catch (err) {
      console.error('Sync error:', err)
    } finally {
      this.isSyncing = false
    }
  }

  private async syncChat(item: SyncQueueItem, chatService: any): Promise<void> {
    const chat = this.chats.get(item.localId)
    if (!chat) {
      this.syncQueue.delete(item.localId)
      return
    }

    // Skip if already synced
    if (chat.syncStatus === 'synced' && chat.remoteId) {
      this.syncQueue.delete(item.localId)
      return
    }

    // Check retry delay
    const retryDelay = Math.min(INITIAL_RETRY_DELAY * Math.pow(2, item.retryCount), MAX_RETRY_DELAY)
    if (item.lastRetryAt && Date.now() - item.lastRetryAt < retryDelay) {
      return // Not time to retry yet
    }

    try {
      console.log(`🔄 Syncing chat: ${chat.localId}`)
      
      const remoteChat = await chatService.createChat(
        chat.mode,
        chat.title,
        chat.profile_id,
        { queueOnFailure: false } // Don't use the old queue, we handle it
      )

      // Update local chat with remote ID
      chat.remoteId = remoteChat.id
      chat.id = remoteChat.id // Use remote ID as primary now
      chat.syncStatus = 'synced'
      chat.lastSyncAt = new Date().toISOString()
      chat.syncError = undefined
      this.chats.set(chat.localId, chat)

      // Update all messages for this chat with the remote chat ID
      const messages = this.getMessagesForChat(chat.localId)
      messages.forEach(msg => {
        msg.remoteChatId = remoteChat.id
        this.messages.set(msg.localId, msg)
      })

      this.syncQueue.delete(item.localId)
      this.emit('chat-synced', chat)
      console.log(`✅ Chat synced: ${chat.localId} -> ${remoteChat.id}`)
    } catch (err: any) {
      item.retryCount++
      item.lastRetryAt = Date.now()
      chat.syncStatus = 'failed'
      chat.syncError = err?.message || 'Unknown error'
      this.chats.set(chat.localId, chat)
      
      if (item.retryCount >= MAX_RETRIES) {
        console.warn(`⚠️ Chat ${chat.localId} exceeded max retries`)
        this.emit('chat-sync-failed', chat)
      }
      console.error(`❌ Failed to sync chat ${chat.localId}:`, err)
    }
  }

  private async syncMessage(item: SyncQueueItem, chatService: any): Promise<void> {
    const msg = this.messages.get(item.localId)
    if (!msg) {
      this.syncQueue.delete(item.localId)
      return
    }

    // If already synced AND has a remoteId, this is an UPDATE not a new message
    // For updates (like isFavorite), we should use updateMessage instead of addMessage
    if (msg.remoteId) {
      // This message was already synced - it's an update to an existing message
      // Mark as synced since the local change is already reflected
      // The favorite status is synced separately via localFavoritesStorage
      console.log(`✅ Message ${msg.localId} already has remoteId ${msg.remoteId}, marking as synced`)
      msg.syncStatus = 'synced'
      msg.lastSyncAt = new Date().toISOString()
      this.messages.set(msg.localId, msg)
      this.syncQueue.delete(item.localId)
      this.saveToStorage()
      return
    }

    // Get the chat to find remote chat ID
    const chat = this.getChat(msg.chatId)
    const remoteChatId = msg.remoteChatId || chat?.remoteId

    // Can't sync message without a synced chat
    if (!remoteChatId) {
      console.log(`⏳ Waiting for chat to sync before syncing message ${msg.localId}`)
      return
    }
    
    // Verify the chat is actually synced (has a remoteId and sync status is not pending)
    if (chat && (chat.syncStatus === 'pending' || chat.syncStatus === 'failed')) {
      console.log(`⏳ Chat ${chat.localId} is still ${chat.syncStatus}, waiting before syncing message ${msg.localId}`)
      return
    }

    // Check retry delay
    const retryDelay = Math.min(INITIAL_RETRY_DELAY * Math.pow(2, item.retryCount), MAX_RETRY_DELAY)
    if (item.lastRetryAt && Date.now() - item.lastRetryAt < retryDelay) {
      return
    }

    try {
      console.log(`🔄 Syncing NEW message: ${msg.localId} to chat ${remoteChatId}`)

      const remoteMsg = await chatService.addMessage(
        remoteChatId,
        {
          role: msg.role,
          content: msg.content,
          metadata: msg.metadata
        }
      )

      // IMPORTANT: Update the message with the remote ID so we can match it later
      msg.remoteId = remoteMsg.id
      msg.syncStatus = 'synced'
      msg.lastSyncAt = new Date().toISOString()
      msg.syncError = undefined
      this.messages.set(msg.localId, msg)
      
      // Save immediately to persist the remoteId mapping
      this.saveToStorage()

      this.syncQueue.delete(item.localId)
      this.emit('message-synced', msg)
      console.log(`✅ Message synced: ${msg.localId} -> ${remoteMsg.id} (remoteId saved)`)
    } catch (err: any) {
      const errorMessage = err?.message || 'Unknown error'
      
      // If "Chat not found", the chat may not have been created yet on the server
      // Clear the remoteChatId so we wait for the chat to sync properly
      if (errorMessage.toLowerCase().includes('chat not found')) {
        console.log(`⚠️ Chat not found for message ${msg.localId}, clearing remoteChatId and waiting for chat sync`)
        msg.remoteChatId = undefined
        if (chat) {
          // Mark chat for re-sync if it claims to be synced but server doesn't have it
          if (chat.syncStatus === 'synced') {
            console.log(`⚠️ Chat ${chat.localId} marked synced but server returned 404 - resetting for re-sync`)
            chat.syncStatus = 'pending'
            chat.remoteId = undefined
            this.chats.set(chat.localId, chat)
            this.addToSyncQueue('chat', chat.localId)
          }
        }
        this.messages.set(msg.localId, msg)
        this.saveToStorage()
        // Don't increment retry count for this case - just wait
        return
      }
      
      item.retryCount++
      item.lastRetryAt = Date.now()
      msg.syncStatus = 'failed'
      msg.syncError = errorMessage
      this.messages.set(msg.localId, msg)

      if (item.retryCount >= MAX_RETRIES) {
        console.warn(`⚠️ Message ${msg.localId} exceeded max retries`)
        this.emit('message-sync-failed', msg)
      }
      console.error(`❌ Failed to sync message ${msg.localId}:`, err)
    }
  }

  // ============ Merge with Remote Data ============

  /**
   * Merge remote chats from Appwrite with local chats
   * This is called when Appwrite data becomes available
   */
  mergeRemoteChats(remoteChats: any[]): void {
    console.log(`🔀 Merging ${remoteChats.length} remote chats with local data`)

    for (const remote of remoteChats) {
      // Skip if this chat was deleted locally (prevents re-merging)
      if (this.deletedChatIds.has(remote.id)) {
        console.log(`⏭️ Skipping deleted chat: ${remote.id}`)
        continue
      }

      // Check if we already have this chat locally (by remoteId)
      const existingLocal = Array.from(this.chats.values()).find(c => c.remoteId === remote.id)
      
      if (existingLocal) {
        // Update local with remote data (remote is source of truth for synced items)
        const merged: LocalChat = {
          ...existingLocal,
          title: remote.title || existingLocal.title,
          last_message_at: remote.last_message_at || existingLocal.last_message_at,
          is_archived: remote.is_archived ?? existingLocal.is_archived,
          updated_at: remote.updated_at || existingLocal.updated_at,
          share_token: remote.share_token,
          is_public: remote.is_public,
          shared_at: remote.shared_at,
        }
        this.chats.set(existingLocal.localId, merged)
      } else {
        // This is a remote-only chat (from another device or before local-first)
        const localId = `remote_${remote.id}`
        
        // Also check if local ID was deleted
        if (this.deletedChatIds.has(localId)) {
          console.log(`⏭️ Skipping deleted chat (local ID): ${localId}`)
          continue
        }
        
        const newLocal: LocalChat = {
          id: remote.id,
          localId,
          remoteId: remote.id,
          user_id: remote.user_id,
          mode: remote.mode as Mode,
          title: remote.title,
          profile_id: remote.profile_id,
          last_message_at: remote.last_message_at,
          is_archived: remote.is_archived || false,
          is_public: remote.is_public,
          share_token: remote.share_token,
          shared_at: remote.shared_at,
          created_at: remote.created_at,
          updated_at: remote.updated_at,
          syncStatus: 'synced',
          lastSyncAt: new Date().toISOString(),
        }
        this.chats.set(localId, newLocal)
      }
    }

    this.saveToStorage()
    this.emit('data-loaded', { chatCount: this.chats.size, messageCount: this.messages.size })
  }

  /**
   * Merge remote messages from Appwrite with local messages
   */
  mergeRemoteMessages(chatId: string, remoteMessages: any[]): void {
    console.log(`🔀 Merging ${remoteMessages.length} remote messages for chat ${chatId}`)

    const chat = this.getChat(chatId)
    const localChatId = chat?.localId || chatId

    for (const remote of remoteMessages) {
      // Check if we already have this message locally by remoteId, localId, or id
      let existingLocal = Array.from(this.messages.values()).find(m => 
        m.remoteId === remote.id || 
        m.localId === remote.id || 
        m.id === remote.id
      )

      // If not found by ID, try to match by content + role + chat (for messages synced before we tracked remoteId properly)
      if (!existingLocal) {
        existingLocal = Array.from(this.messages.values()).find(m =>
          (m.chatId === localChatId || m.remoteChatId === chatId) &&
          m.role === remote.role &&
          m.content === remote.content &&
          m.syncStatus !== 'synced' // Only match pending/failed messages
        )
        if (existingLocal) {
          console.log(`🔍 Found local message by content match: ${existingLocal.localId} -> ${remote.id}`)
        }
      }

      if (existingLocal) {
        // Update local with remote data and mark as synced
        const merged: LocalMessage = {
          ...existingLocal,
          remoteId: remote.id, // Set the remoteId now that we know it
          content: remote.content || existingLocal.content,
          isFavorite: remote.is_favorite ?? existingLocal.isFavorite,
          syncStatus: 'synced',
          lastSyncAt: new Date().toISOString(),
        }
        this.messages.set(existingLocal.localId, merged)
        // Remove from sync queue since it's now synced
        this.syncQueue.delete(existingLocal.localId)
        console.log(`✅ Merged remote message ${remote.id} with local ${existingLocal.localId}`)
      } else {
        // Check if this is a truly new remote-only message (from another device)
        // Skip if we might have it under a different ID structure
        const alreadyExists = this.messages.has(`remote_msg_${remote.id}`)
        if (alreadyExists) {
          console.log(`⏭️ Remote message ${remote.id} already exists, skipping`)
          continue
        }
        
        // Also check if any local message has this remoteId already set
        const hasRemoteId = Array.from(this.messages.values()).some(m => m.remoteId === remote.id)
        if (hasRemoteId) {
          console.log(`⏭️ Remote message ${remote.id} already linked to local, skipping`)
          continue
        }
        
        // Remote-only message
        const localId = `remote_msg_${remote.id}`
        const newLocal: LocalMessage = {
          id: remote.id,
          localId,
          remoteId: remote.id,
          chatId: chat?.localId || chatId,
          remoteChatId: remote.chat_id,
          role: remote.role,
          content: remote.content,
          metadata: remote.metadata,
          createdAt: remote.created_at,
          isFavorite: remote.is_favorite || false,
          syncStatus: 'synced',
          lastSyncAt: new Date().toISOString(),
        }
        this.messages.set(localId, newLocal)
        console.log(`➕ Added remote-only message ${remote.id}`)
      }
    }

    this.saveToStorage()
  }

  // ============ Stats ============

  getStats() {
    const pendingChats = Array.from(this.chats.values()).filter(c => c.syncStatus === 'pending').length
    const pendingMessages = Array.from(this.messages.values()).filter(m => m.syncStatus === 'pending').length
    const failedChats = Array.from(this.chats.values()).filter(c => c.syncStatus === 'failed').length
    const failedMessages = Array.from(this.messages.values()).filter(m => m.syncStatus === 'failed').length

    return {
      totalChats: this.chats.size,
      totalMessages: this.messages.size,
      pendingChats,
      pendingMessages,
      failedChats,
      failedMessages,
      syncQueueSize: this.syncQueue.size,
      isSyncing: this.isSyncing,
    }
  }

  // Force retry all failed items
  retryFailed(): void {
    // Reset failed chats
    this.chats.forEach(chat => {
      if (chat.syncStatus === 'failed') {
        chat.syncStatus = 'pending'
        this.addToSyncQueue('chat', chat.localId)
      }
    })

    // Reset failed messages
    this.messages.forEach(msg => {
      if (msg.syncStatus === 'failed') {
        msg.syncStatus = 'pending'
        this.addToSyncQueue('message', msg.localId)
      }
    })

    // Reset retry counts
    this.syncQueue.forEach(item => {
      item.retryCount = 0
      item.lastRetryAt = undefined
    })

    this.saveToStorage()
    this.syncNow()
  }

  // Clear all local data (use with caution)
  clearAll(): void {
    this.chats.clear()
    this.messages.clear()
    this.syncQueue.clear()
    this.saveToStorage()
    console.log('🗑️ Cleared all local chat storage')
  }
}

// Export singleton
export const localChatStorage = new LocalChatStorageService()
