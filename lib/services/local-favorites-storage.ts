/**
 * Local-First Favorites Storage Service
 * 
 * This service implements a local-first approach where:
 * 1. ALL favorites are stored in localStorage FIRST
 * 2. Sync to Appwrite happens in the background (non-blocking)
 * 3. Favorites list is always available from localStorage
 * 4. No loading states that block the UI
 * 5. Graceful merge when Appwrite data becomes available
 */

import type { Mode } from '@/types/chat'

export interface LocalFavorite {
  id: string
  localId: string
  remoteId?: string // Appwrite favorites table ID once synced
  messageId: string // Local message ID
  remoteMessageId?: string // Appwrite message ID
  chatId: string // Local chat ID
  remoteChatId?: string // Appwrite chat ID
  content: string
  role: 'user' | 'assistant' | 'system'
  mode?: Mode
  chatTitle?: string
  createdAt: string // When the message was created
  favoritedAt: string // When it was favorited
  syncStatus: 'pending' | 'synced' | 'failed'
  syncError?: string
  lastSyncAt?: string
}

interface SyncQueueItem {
  type: 'add' | 'remove'
  localId: string
  messageId: string
  remoteMessageId?: string
  retryCount: number
  lastRetryAt?: number
}

const FAVORITES_STORAGE_KEY = 'radhika-local-favorites'
const SYNC_QUEUE_KEY = 'radhika-favorites-sync-queue'
const MAX_RETRIES = 10
const SYNC_INTERVAL = 15000 // 15 seconds
const INITIAL_RETRY_DELAY = 2000
const MAX_RETRY_DELAY = 120000 // 2 minutes

type EventType = 
  | 'favorite-added'
  | 'favorite-removed'
  | 'favorite-synced'
  | 'favorite-sync-failed'
  | 'sync-started'
  | 'sync-completed'
  | 'data-loaded'
  | 'remote-merged'

type EventCallback = (event: EventType, data?: any) => void

class LocalFavoritesStorageService {
  private favorites: Map<string, LocalFavorite> = new Map()
  private syncQueue: Map<string, SyncQueueItem> = new Map()
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

  private initialize() {
    if (this.initialized) return
    this.initialized = true

    this.loadFromStorage()
    this.startBackgroundSync()

    // Sync when online
    window.addEventListener('online', () => {
      console.log('🌐 [Favorites] Online - triggering sync')
      this.syncNow()
    })

    // Sync when tab becomes visible
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        console.log('👁️ [Favorites] Tab visible - triggering sync')
        this.syncNow()
      }
    })

    // Save before unload
    window.addEventListener('beforeunload', () => {
      this.saveToStorage()
    })

    // Periodic save (every 5 seconds)
    setInterval(() => {
      this.saveToStorage()
    }, 5000)
    
    // Listen for chat message sync events - when a message gets synced, we can sync favorites
    this.listenForMessageSyncs()
  }
  
  private async listenForMessageSyncs() {
    // Import localChatStorage dynamically to avoid circular dependency
    const { localChatStorage } = await import('./local-chat-storage')
    
    localChatStorage.subscribe((event, data) => {
      if (event === 'message-synced' && data?.localId) {
        // Check if we have a pending favorite for this message
        const messageLocalId = data.localId
        const messageRemoteId = data.remoteId
        
        const hasPendingFavorite = Array.from(this.syncQueue.values()).some(
          item => item.type === 'add' && item.messageId === messageLocalId
        )
        if (hasPendingFavorite) {
          console.log('📬 [Favorites] Message synced, triggering favorite sync:', messageLocalId, '->', messageRemoteId)
          // Update the favorite with the remote message ID
          const favorite = Array.from(this.favorites.values()).find(
            fav => fav.messageId === messageLocalId
          )
          if (favorite && messageRemoteId) {
            favorite.remoteMessageId = messageRemoteId
            this.favorites.set(favorite.localId, favorite)
            this.saveToStorage()
          }
          // Trigger sync
          setTimeout(() => this.syncNow(), 500)
        }
      }
    })
  }

  // Set current user ID (call this when user logs in)
  setUserId(userId: string) {
    if (this.currentUserId !== userId) {
      // Clear in-memory cache when user changes
      this.favorites.clear()
      this.syncQueue.clear()
      
      this.currentUserId = userId
      this.loadFromStorage() // Reload for this user
      console.log(`👤 [Favorites] Switched to user ${userId}, loaded their data`)
    }
  }

  // Clear user data (call this when user logs out)
  clearCurrentUser() {
    this.favorites.clear()
    this.syncQueue.clear()
    this.currentUserId = null
    console.log('👤 [Favorites] Cleared current user data')
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
      // Load favorites
      const favoritesJson = localStorage.getItem(this.getStorageKey(FAVORITES_STORAGE_KEY))
      if (favoritesJson) {
        const favoritesArray: LocalFavorite[] = JSON.parse(favoritesJson)
        this.favorites.clear()
        favoritesArray.forEach(fav => this.favorites.set(fav.localId, fav))
        console.log(`📥 [Favorites] Loaded ${favoritesArray.length} favorites from localStorage`)
        
        // Deduplicate on load
        this.deduplicateFavorites()
      }

      // Load sync queue
      const queueJson = localStorage.getItem(this.getStorageKey(SYNC_QUEUE_KEY))
      if (queueJson) {
        const queueArray: SyncQueueItem[] = JSON.parse(queueJson)
        this.syncQueue.clear()
        queueArray.forEach(item => this.syncQueue.set(item.localId, item))
        console.log(`📥 [Favorites] Loaded ${queueArray.length} sync queue items`)
      }

      this.emit('data-loaded', { count: this.favorites.size })
    } catch (error) {
      console.error('❌ [Favorites] Error loading from storage:', error)
    }
  }

  private saveToStorage() {
    try {
      // Save favorites
      const favoritesArray = Array.from(this.favorites.values())
      localStorage.setItem(this.getStorageKey(FAVORITES_STORAGE_KEY), JSON.stringify(favoritesArray))

      // Save sync queue
      const queueArray = Array.from(this.syncQueue.values())
      localStorage.setItem(this.getStorageKey(SYNC_QUEUE_KEY), JSON.stringify(queueArray))
    } catch (error) {
      console.error('❌ [Favorites] Error saving to storage:', error)
    }
  }

  // ============ Favorites CRUD ============

  /**
   * Add a message to favorites (local-first)
   */
  addFavorite(params: {
    messageId: string
    remoteMessageId?: string
    chatId: string
    remoteChatId?: string
    content: string
    role: 'user' | 'assistant' | 'system'
    mode?: Mode
    chatTitle?: string
    createdAt: string
  }): LocalFavorite {
    const now = new Date().toISOString()
    const localId = `fav-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    // Check if already favorited (by messageId)
    const existing = this.getFavoriteByMessageId(params.messageId)
    if (existing) {
      console.log('⚠️ [Favorites] Message already favorited by ID:', params.messageId)
      return existing
    }

    // Also check by content + role to prevent duplicates (ignore timestamp)
    const existingByContent = Array.from(this.favorites.values()).find(
      fav => fav.content === params.content && fav.role === params.role
    )
    if (existingByContent) {
      console.log('⚠️ [Favorites] Message already favorited by content:', params.messageId)
      return existingByContent
    }

    const favorite: LocalFavorite = {
      id: localId,
      localId,
      messageId: params.messageId,
      remoteMessageId: params.remoteMessageId,
      chatId: params.chatId,
      remoteChatId: params.remoteChatId,
      content: params.content,
      role: params.role,
      mode: params.mode,
      chatTitle: params.chatTitle,
      createdAt: params.createdAt,
      favoritedAt: now,
      syncStatus: 'pending',
    }

    this.favorites.set(localId, favorite)
    this.queueSync({ type: 'add', localId, messageId: params.messageId, remoteMessageId: params.remoteMessageId, retryCount: 0 })
    this.saveToStorage()
    this.emit('favorite-added', favorite)

    console.log('⭐ [Favorites] Added to favorites locally:', localId)

    // Trigger background sync
    this.syncNow()

    return favorite
  }

  /**
   * Remove a message from favorites (local-first)
   */
  removeFavorite(messageId: string): boolean {
    let favorite = this.getFavoriteByMessageId(messageId)
    
    // If not found by messageId, try to find by localId (in case it's the localId)
    if (!favorite) {
      favorite = this.favorites.get(messageId) || undefined
    }
    
    if (!favorite) {
      console.log('⚠️ [Favorites] Favorite not found for messageId:', messageId)
      return false
    }

    this.favorites.delete(favorite.localId)
    
    // If it was synced, queue removal from server
    if (favorite.remoteId || favorite.remoteMessageId) {
      this.queueSync({ 
        type: 'remove', 
        localId: favorite.localId, 
        messageId: favorite.messageId,
        remoteMessageId: favorite.remoteMessageId,
        retryCount: 0 
      })
    }

    this.saveToStorage()
    this.emit('favorite-removed', { localId: favorite.localId, messageId })

    console.log('🗑️ [Favorites] Removed from favorites locally:', favorite.localId)

    // Trigger background sync
    this.syncNow()

    return true
  }

  /**
   * Remove favorite by content (used for deduplication scenarios)
   */
  removeFavoriteByContent(content: string, role: string): boolean {
    const favorite = Array.from(this.favorites.values()).find(
      fav => fav.content === content && fav.role === role
    )
    
    if (!favorite) {
      return false
    }

    return this.removeFavorite(favorite.messageId)
  }

  /**
   * Check if a message is favorited
   */
  isFavorited(messageId: string): boolean {
    return this.getFavoriteByMessageId(messageId) !== undefined
  }

  /**
   * Get all favorites
   */
  getFavorites(): LocalFavorite[] {
    return Array.from(this.favorites.values())
      .sort((a, b) => new Date(b.favoritedAt).getTime() - new Date(a.favoritedAt).getTime())
  }

  /**
   * Get favorite by message ID
   */
  getFavoriteByMessageId(messageId: string): LocalFavorite | undefined {
    return Array.from(this.favorites.values()).find(
      fav => fav.messageId === messageId || fav.remoteMessageId === messageId
    )
  }

  /**
   * Update favorite after sync
   */
  updateFavorite(localId: string, updates: Partial<LocalFavorite>) {
    const favorite = this.favorites.get(localId)
    if (favorite) {
      Object.assign(favorite, updates)
      this.favorites.set(localId, favorite)
      this.saveToStorage()
    }
  }

  // ============ Sync Queue ============

  private queueSync(item: SyncQueueItem) {
    this.syncQueue.set(item.localId, item)
    this.saveToStorage()
  }

  // ============ Background Sync ============

  private startBackgroundSync() {
    if (this.syncIntervalId) return

    this.syncIntervalId = setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        this.syncNow()
      }
    }, SYNC_INTERVAL)
  }

  async syncNow() {
    if (this.isSyncing) return
    this.isSyncing = true
    this.emit('sync-started')

    try {
      await this.processQueue()
    } catch (error) {
      console.error('❌ [Favorites] Sync error:', error)
    } finally {
      this.isSyncing = false
      this.emit('sync-completed')
    }
  }

  private async processQueue() {
    const items = Array.from(this.syncQueue.values())
    
    for (const item of items) {
      // Check if enough time has passed for retry
      if (item.lastRetryAt) {
        const delay = Math.min(INITIAL_RETRY_DELAY * Math.pow(2, item.retryCount), MAX_RETRY_DELAY)
        if (Date.now() - item.lastRetryAt < delay) continue
      }

      if (item.retryCount >= MAX_RETRIES) {
        console.log(`⚠️ [Favorites] Max retries reached for ${item.localId}, removing from queue`)
        this.syncQueue.delete(item.localId)
        continue
      }

      try {
        if (item.type === 'add') {
          const success = await this.syncAddFavorite(item)
          if (success) {
            this.syncQueue.delete(item.localId)
          }
          // If not successful, keep in queue for retry (don't delete)
        } else {
          await this.syncRemoveFavorite(item)
          this.syncQueue.delete(item.localId)
        }
      } catch (error: any) {
        console.error(`❌ [Favorites] Sync failed for ${item.localId}:`, error)
        item.retryCount++
        item.lastRetryAt = Date.now()
        this.syncQueue.set(item.localId, item)
        
        const favorite = this.favorites.get(item.localId)
        if (favorite) {
          favorite.syncStatus = 'failed'
          favorite.syncError = error.message
          this.favorites.set(item.localId, favorite)
          this.emit('favorite-sync-failed', { localId: item.localId, error: error.message })
        }
      }
    }

    this.saveToStorage()
  }

  private async syncAddFavorite(item: SyncQueueItem): Promise<boolean> {
    const favorite = this.favorites.get(item.localId)
    if (!favorite) {
      console.log('⚠️ [Favorites] Favorite not found in storage:', item.localId)
      return true // Already deleted, consider done
    }

    console.log('🔄 [Favorites] Attempting to sync favorite:', {
      localId: item.localId,
      messageId: favorite.messageId,
      remoteMessageId: favorite.remoteMessageId,
    })

    // If we don't have a remote message ID, we need to look it up
    let remoteMessageId = favorite.remoteMessageId || item.remoteMessageId

    if (!remoteMessageId) {
      // Try to get from local chat storage
      const { localChatStorage } = await import('./local-chat-storage')
      const localMessage = localChatStorage.getMessage(favorite.messageId)
      
      console.log('🔍 [Favorites] Looking up message in localStorage:', {
        messageId: favorite.messageId,
        found: !!localMessage,
        remoteId: localMessage?.remoteId,
        syncStatus: localMessage?.syncStatus,
      })
      
      if (localMessage?.remoteId) {
        remoteMessageId = localMessage.remoteId
        favorite.remoteMessageId = remoteMessageId
        this.favorites.set(item.localId, favorite)
        this.saveToStorage()
        console.log('✅ [Favorites] Found remoteMessageId:', remoteMessageId)
      } else {
        // Message not synced yet - this is NORMAL for local-first
        // Return false to keep in queue and retry later
        console.log('⏳ [Favorites] Message not synced to Appwrite yet, will retry later:', favorite.messageId)
        return false
      }
    }

    console.log('📤 [Favorites] Calling /api/favorites with messageId:', remoteMessageId)

    // Use the API route to add favorite
    const response = await fetch('/api/favorites', {
      method: 'POST',
      credentials: 'include',
      headers: { 
        'Content-Type': 'application/json',
        ...(this.currentUserId ? { 'x-user-id': this.currentUserId } : {}),
      },
      body: JSON.stringify({ messageId: remoteMessageId }),
    })

    console.log('📥 [Favorites] API response status:', response.status)

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('❌ [Favorites] API error:', errorData)
      throw new Error(errorData.error || `Failed to sync favorite: ${response.status}`)
    }

    const data = await response.json()
    
    // Update local favorite with remote ID
    favorite.remoteId = data.favorite?.id
    favorite.remoteMessageId = remoteMessageId
    favorite.syncStatus = 'synced'
    favorite.lastSyncAt = new Date().toISOString()
    favorite.syncError = undefined
    this.favorites.set(item.localId, favorite)

    console.log('✅ [Favorites] Synced add favorite:', item.localId)
    this.emit('favorite-synced', { localId: item.localId, remoteId: favorite.remoteId })
    return true
  }

  private async syncRemoveFavorite(item: SyncQueueItem) {
    const remoteMessageId = item.remoteMessageId

    if (!remoteMessageId) {
      console.log('⚠️ [Favorites] No remote message ID, skipping remove sync:', item.localId)
      return
    }

    const response = await fetch(`/api/favorites?messageId=${remoteMessageId}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: {
        ...(this.currentUserId ? { 'x-user-id': this.currentUserId } : {}),
      },
    })

    if (!response.ok && response.status !== 404) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `Failed to remove favorite: ${response.status}`)
    }

    console.log('✅ [Favorites] Synced remove favorite:', item.localId)
  }

  // ============ Remote Data Merge ============

  /**
   * Merge favorites from Appwrite (called after fetching from server)
   * Deduplicates by content+role to avoid showing duplicate messages
   */
  mergeRemoteFavorites(remoteFavorites: Array<{
    id: string
    message_id: string
    created_at: string
    chat_messages?: {
      id: string
      content: string
      role: string
      created_at: string
      chats?: {
        id: string
        title: string
        mode: string
      }
    }
  }>) {
    let added = 0
    let updated = 0
    let skipped = 0

    // Track content we've seen to deduplicate at source
    const seenContent = new Set<string>()
    
    // First pass: mark what content we already have locally
    for (const fav of this.favorites.values()) {
      const key = `${fav.content}|${fav.role}`
      seenContent.add(key)
    }

    for (const remote of remoteFavorites) {
      if (!remote.chat_messages) {
        skipped++
        continue
      }

      const contentKey = `${remote.chat_messages.content}|${remote.chat_messages.role}`
      
      // Skip if we've already processed this content (duplicate in remote)
      if (seenContent.has(contentKey)) {
        // But update the existing one with remote IDs if needed
        const existing = Array.from(this.favorites.values()).find(
          fav => fav.content === remote.chat_messages!.content && 
                 fav.role === remote.chat_messages!.role
        )
        if (existing && !existing.remoteId) {
          existing.remoteId = remote.id
          existing.remoteMessageId = remote.message_id
          existing.syncStatus = 'synced'
          existing.lastSyncAt = new Date().toISOString()
          this.favorites.set(existing.localId, existing)
          updated++
        } else {
          skipped++
        }
        continue
      }

      // Mark this content as seen
      seenContent.add(contentKey)

      // Find by remote ID first (most reliable)
      let existing = Array.from(this.favorites.values()).find(
        fav => fav.remoteId === remote.id
      )

      // Then try by remote message ID
      if (!existing) {
        existing = Array.from(this.favorites.values()).find(
          fav => fav.remoteMessageId === remote.message_id
        )
      }

      if (existing) {
        // Update existing with remote data
        existing.remoteId = remote.id
        existing.remoteMessageId = remote.message_id
        existing.syncStatus = 'synced'
        existing.lastSyncAt = new Date().toISOString()
        this.favorites.set(existing.localId, existing)
        updated++
      } else {
        // Add new favorite from remote
        const localId = `fav-remote-${remote.id}`
        const newFavorite: LocalFavorite = {
          id: localId,
          localId,
          remoteId: remote.id,
          messageId: remote.message_id,
          remoteMessageId: remote.message_id,
          chatId: remote.chat_messages.chats?.id || '',
          remoteChatId: remote.chat_messages.chats?.id,
          content: remote.chat_messages.content,
          role: remote.chat_messages.role as 'user' | 'assistant' | 'system',
          mode: remote.chat_messages.chats?.mode as Mode,
          chatTitle: remote.chat_messages.chats?.title,
          createdAt: remote.chat_messages.created_at,
          favoritedAt: remote.created_at,
          syncStatus: 'synced',
          lastSyncAt: new Date().toISOString(),
        }
        this.favorites.set(localId, newFavorite)
        added++
      }
    }

    // After merge, deduplicate aggressively
    this.deduplicateFavorites()

    this.saveToStorage()
    console.log(`🔄 [Favorites] Merged remote favorites: ${added} added, ${updated} updated, ${skipped} skipped`)
    this.emit('remote-merged', { added, updated })
  }

  /**
   * Remove duplicate favorites (same content + role)
   * More aggressive - ignores timestamps since remote can have different timestamps
   */
  deduplicateFavorites() {
    const seen = new Map<string, LocalFavorite>()
    const duplicates: string[] = []

    for (const [localId, fav] of this.favorites) {
      // Create a unique key based on content + role ONLY (ignore timestamp)
      const key = `${fav.content}|${fav.role}`
      
      const existing = seen.get(key)
      if (existing) {
        // Keep the one that is synced, or the one with remoteId
        if (existing.syncStatus === 'synced' || existing.remoteId) {
          // Remove the current one as duplicate
          duplicates.push(localId)
        } else if (fav.syncStatus === 'synced' || fav.remoteId) {
          // Replace with current one, remove existing
          duplicates.push(existing.localId)
          seen.set(key, fav)
        } else {
          // Both are unsynced, keep the newer one (by favoritedAt)
          if (new Date(fav.favoritedAt) > new Date(existing.favoritedAt)) {
            duplicates.push(existing.localId)
            seen.set(key, fav)
          } else {
            duplicates.push(localId)
          }
        }
      } else {
        seen.set(key, fav)
      }
    }

    // Remove duplicates
    for (const localId of duplicates) {
      this.favorites.delete(localId)
      this.syncQueue.delete(localId) // Also remove from sync queue
    }

    if (duplicates.length > 0) {
      console.log(`🧹 [Favorites] Removed ${duplicates.length} duplicate favorites`)
      this.saveToStorage()
    }
  }

  /**
   * Clear all favorites (for logout)
   */
  clearAll() {
    this.favorites.clear()
    this.syncQueue.clear()
    this.saveToStorage()
    console.log('🗑️ [Favorites] Cleared all favorites')
  }

  /**
   * Get sync status for debugging
   */
  getStatus() {
    const favorites = Array.from(this.favorites.values())
    const queue = Array.from(this.syncQueue.values())
    
    return {
      totalFavorites: favorites.length,
      pendingSync: favorites.filter(f => f.syncStatus === 'pending').length,
      synced: favorites.filter(f => f.syncStatus === 'synced').length,
      failed: favorites.filter(f => f.syncStatus === 'failed').length,
      queueSize: queue.length,
      queueItems: queue.map(item => ({
        localId: item.localId,
        type: item.type,
        messageId: item.messageId,
        retryCount: item.retryCount,
        hasRemoteMessageId: !!item.remoteMessageId,
      })),
      isSyncing: this.isSyncing,
    }
  }

  /**
   * Force immediate sync (for debugging)
   */
  async forceSync() {
    console.log('🔧 [Favorites] Force sync triggered')
    console.log('📊 [Favorites] Current status:', this.getStatus())
    this.isSyncing = false // Reset to allow sync
    await this.syncNow()
    console.log('📊 [Favorites] Status after sync:', this.getStatus())
  }
}

// Export singleton
export const localFavoritesStorage = new LocalFavoritesStorageService()
