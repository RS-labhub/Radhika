import { APPWRITE_CONFIG } from './config'
import type { Chat, ChatMessage, Favorite } from '@/types/chat'

// Re-export for compatibility
export { ID, Query, getDatabases, getAccount, getStorage, createClient } from './client'

// Helper to check if a string is a valid UUID/ID
function isValidID(str: string): boolean {
  // Appwrite uses 20-character unique IDs or custom IDs
  return !!str && str.length >= 1 && str.length <= 36
}

// Check if error is a timeout or network error that should be retried
function isRetryableError(error: any): boolean {
  if (!error) return false
  
  if (isAbortError(error)) return false
  
  const message = error.message?.toLowerCase() || ''
  const code = error.code?.toString() || ''
  
  if (
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('connection') ||
    message.includes('failed to fetch') ||
    message.includes('load failed')
  ) {
    return true
  }
  
  // Appwrite error codes that are retryable
  if (code === '500' || code === '502' || code === '503' || code === '504') {
    return true
  }
  
  return false
}

function isAbortError(error: any): boolean {
  if (!error) return false
  return (
    error.name === 'AbortError' ||
    error.code === 'ABORT_ERR' ||
    error.message?.toLowerCase().includes('aborted')
  )
}

export class ChatService {
  private databases: any
  private account: any
  private userCache: { user: any; timestamp: number } | null = null
  private readonly CACHE_TTL = 120000
  private generation = 0
  private abortController = new AbortController()
  
  // Caches to reduce DB calls
  private chatsCache: Map<string, { chats: Chat[]; timestamp: number }> = new Map()
  private messagesCache: Map<string, { messages: ChatMessage[]; timestamp: number }> = new Map()
  private pendingChatsFetch: Map<string, Promise<Chat[]>> = new Map()
  private pendingMessagesFetch: Map<string, Promise<ChatMessage[]>> = new Map()
  private readonly CHATS_CACHE_TTL = 30000 // 30 seconds for chat list
  private readonly MESSAGES_CACHE_TTL = 15000 // 15 seconds for messages

  constructor() {
    // Lazy initialization - will be set on first use
    this.databases = null
    this.account = null
  }

  private async initClients() {
    if (!this.databases || !this.account) {
      const { getDatabases, getAccount } = await import('./client')
      this.databases = getDatabases()
      this.account = getAccount()
    }
  }

  private resetClients() {
    console.log('🔄 Resetting Appwrite clients...')
    this.databases = null
    this.account = null
    this.userCache = null
    this.generation++
    this.abortController.abort()
    this.abortController = new AbortController()
  }

  async getCurrentUser(): Promise<any | null> {
    await this.initClients()
    
    if (this.userCache && Date.now() - this.userCache.timestamp < this.CACHE_TTL) {
      return this.userCache.user
    }

    try {
      const user = await this.account.get()
      this.userCache = { user, timestamp: Date.now() }
      return user
    } catch (error: any) {
      if (error.code === 401) {
        this.userCache = null
        return null
      }
      throw error
    }
  }

  // Overloaded getChats for backwards compatibility
  async getChats(options?: {
    mode?: string
    profileId?: string
    includeArchived?: boolean
    limit?: number
  }): Promise<Chat[]>
  async getChats(mode: string, profileId?: string): Promise<Chat[]>
  async getChats(
    arg1?: string | { mode?: string; profileId?: string; includeArchived?: boolean; limit?: number },
    arg2?: string
  ): Promise<Chat[]> {
    // Handle backwards compatible call: getChats(mode, profileId)
    let mode: string | undefined
    let profileId: string | undefined
    let includeArchived = false
    let limit = 50

    if (typeof arg1 === 'string') {
      mode = arg1
      profileId = arg2
    } else if (arg1) {
      mode = arg1.mode
      profileId = arg1.profileId
      includeArchived = arg1.includeArchived ?? false
      limit = arg1.limit ?? 50
    }

    // Get current user first
    const user = await this.getCurrentUser()
    if (!user) return []

    // Build cache key
    const cacheKey = `${user.$id}:${mode || ''}:${profileId || ''}:${includeArchived}:${limit}`
    
    // Check cache first
    const cached = this.chatsCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < this.CHATS_CACHE_TTL) {
      console.log('Using cached chats list')
      return cached.chats
    }
    
    // Check if there's already a pending request for the same data (request deduplication)
    const pending = this.pendingChatsFetch.get(cacheKey)
    if (pending) {
      console.log('Waiting for pending chats fetch')
      return pending
    }

    // Create the fetch promise
    const fetchPromise = this.fetchChatsInternal(user, mode, profileId, includeArchived, limit, cacheKey)
    this.pendingChatsFetch.set(cacheKey, fetchPromise)
    
    try {
      const result = await fetchPromise
      return result
    } finally {
      this.pendingChatsFetch.delete(cacheKey)
    }
  }
  
  private async fetchChatsInternal(
    user: any,
    mode: string | undefined,
    profileId: string | undefined,
    includeArchived: boolean,
    limit: number,
    cacheKey: string
  ): Promise<Chat[]> {
    // Use API route for fetching chats (avoids permission issues)
    try {
      const params = new URLSearchParams()
      if (mode) params.set('mode', mode)
      if (profileId) params.set('profileId', profileId)
      if (includeArchived) params.set('includeArchived', 'true')
      if (limit) params.set('limit', String(limit))
      
      const res = await fetch(`/api/chats?${params.toString()}`, {
        credentials: 'include', // Include cookies in the request
        headers: {
          'x-user-id': user.$id // Pass user ID for server-side verification
        }
      })
      if (!res.ok) {
        console.warn('Failed to fetch chats via API, trying direct access')
        return this.getChatsDirectly(mode, profileId, includeArchived, limit)
      }
      
      const data = await res.json()
      const chats = data.chats || []
      
      // Cache the result
      this.chatsCache.set(cacheKey, { chats, timestamp: Date.now() })
      
      return chats
    } catch (error) {
      console.warn('API fetch failed, trying direct access:', error)
      return this.getChatsDirectly(mode, profileId, includeArchived, limit)
    }
  }

  private async getChatsDirectly(
    mode?: string,
    profileId?: string,
    includeArchived = false,
    limit = 50
  ): Promise<Chat[]> {
    await this.initClients()
    
    const user = await this.getCurrentUser()
    if (!user) return []

    const { Query } = await import('./client')

    const queries = [
      Query.equal('user_id', user.$id),
      Query.orderDesc('last_message_at'),
      Query.limit(Math.min(limit, 100)),
    ]

    if (mode) {
      queries.push(Query.equal('mode', mode))
    }

    if (profileId) {
      queries.push(Query.equal('profile_id', profileId))
    }

    if (!includeArchived) {
      queries.push(Query.equal('is_archived', false))
    }

    // Exclude soft-deleted chats
    queries.push(Query.isNull('deleted_at'))

    const response = await this.databases.listDocuments(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.chats,
      queries
    )

    return response.documents.map(this.mapChatDocument)
  }

  async getChat(chatId: string): Promise<Chat | null> {
    await this.initClients()
    
    if (!isValidID(chatId)) return null

    try {
      const doc = await this.databases.getDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.chats,
        chatId
      )
      return this.mapChatDocument(doc)
    } catch (error: any) {
      if (error.code === 404) return null
      throw error
    }
  }

  // Alias for backwards compatibility
  async getChatById(chatId: string): Promise<Chat | null> {
    return this.getChat(chatId)
  }

  // Overloaded createChat for backwards compatibility
  async createChat(data: { mode: string; title: string; profileId?: string }): Promise<Chat>
  async createChat(mode: string, title: string, profileId?: string, options?: { queueOnFailure?: boolean }): Promise<Chat>
  async createChat(
    arg1: string | { mode: string; title: string; profileId?: string },
    arg2?: string,
    arg3?: string,
    _options?: { queueOnFailure?: boolean }
  ): Promise<Chat> {
    await this.initClients()
    
    const user = await this.getCurrentUser()
    if (!user) throw new Error('Not authenticated')

    // Handle both call signatures
    let mode: string
    let title: string
    let profileId: string | undefined

    if (typeof arg1 === 'string') {
      // Old signature: createChat(mode, title, profileId, options)
      mode = arg1
      title = arg2 || ''
      profileId = arg3
    } else {
      // New signature: createChat({ mode, title, profileId })
      mode = arg1.mode
      title = arg1.title
      profileId = arg1.profileId
    }

    // Use API route to create chat (handles permissions via service client)
    const response = await fetch('/api/chats', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-user-id': user.$id // Pass user ID for server-side verification
      },
      credentials: 'include', // Include cookies in the request
      body: JSON.stringify({
        mode,
        title,
        profileId,
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to create chat' }))
      throw new Error(error.error || 'Failed to create chat')
    }

    const result = await response.json()
    return result.chat
  }

  async updateChat(chatId: string, updates: Partial<Chat>): Promise<Chat> {
    const user = await this.getCurrentUser()
    
    const updateData: any = {
      ...updates,
    }

    // Remove fields that shouldn't be updated directly
    delete updateData.id
    delete updateData.$id
    delete updateData.user_id
    delete updateData.created_at

    // Use API route for updates
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      }
      if (user) {
        headers['x-user-id'] = user.$id
      }
      
      const res = await fetch(`/api/chats/${chatId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers,
        body: JSON.stringify(updateData)
      })
      
      if (res.ok) {
        const result = await res.json()
        return result.chat
      }
      
      const error = await res.json().catch(() => ({ error: 'Failed to update chat' }))
      throw new Error(error.error || 'Failed to update chat')
    } catch (error) {
      console.error('Failed to update chat via API:', error)
      throw error
    }
  }

  async deleteChat(chatId: string, permanent = false): Promise<void> {
    const user = await this.getCurrentUser()
    
    // Use API route for deletion
    try {
      const headers: Record<string, string> = {}
      if (user) {
        headers['x-user-id'] = user.$id
      }
      
      const res = await fetch(`/api/chats/${chatId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers
      })
      
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Failed to delete chat' }))
        const errorMsg = error.error || 'Failed to delete chat'
        // For "not found" errors, don't throw - the chat might be local-only
        if (errorMsg.toLowerCase().includes('not found') || errorMsg.toLowerCase().includes('unauthorized')) {
          console.log('Chat not found or unauthorized (may be local-only):', chatId)
          return // Successfully "deleted" - it doesn't exist or we don't own it
        }
        // For other errors, log but don't throw - we want local deletion to succeed
        console.warn('API deletion warning for chat:', chatId, errorMsg)
        return
      }
      console.log('Successfully deleted chat from database:', chatId)
    } catch (error: any) {
      // Re-check if it's a "not found" error
      const errMsg = error?.message || String(error)
      if (errMsg.toLowerCase().includes('not found') || errMsg.toLowerCase().includes('unauthorized')) {
        console.log('Chat not found or unauthorized (may be local-only):', chatId)
        return // Successfully "deleted" - it doesn't exist
      }
      // Log other errors but don't throw - local deletion should still succeed
      console.warn('Failed to delete chat via API (will continue with local deletion):', chatId, error)
    }
  }

  async deleteAllChats(): Promise<void> {
    const user = await this.getCurrentUser()
    if (!user) throw new Error('Not authenticated')

    // Get all chats first
    const chats = await this.getChats()
    
    // Delete each chat
    for (const chat of chats) {
      await this.deleteChat(chat.id, true)
    }
  }

  async getChatMessages(chatId: string, options: {
    limit?: number
    cursor?: string
    direction?: 'asc' | 'desc'
  } = {}): Promise<ChatMessage[]> {
    const { limit = 50, cursor, direction = 'asc' } = options
    
    // Build cache key (only for non-paginated requests without cursor)
    const cacheKey = cursor ? null : `${chatId}:${limit}:${direction}`
    
    // Check cache first (only if no cursor - paginated requests should not be cached)
    if (cacheKey) {
      const cached = this.messagesCache.get(cacheKey)
      if (cached && Date.now() - cached.timestamp < this.MESSAGES_CACHE_TTL) {
        console.log(`Using cached messages for chat ${chatId}`)
        return cached.messages
      }
      
      // Check for pending request deduplication
      const pending = this.pendingMessagesFetch.get(cacheKey)
      if (pending) {
        console.log(`Waiting for pending messages fetch for chat ${chatId}`)
        return pending
      }
    }
    
    // Create the fetch promise
    const fetchPromise = this.fetchMessagesInternal(chatId, options, cacheKey)
    if (cacheKey) {
      this.pendingMessagesFetch.set(cacheKey, fetchPromise)
    }
    
    try {
      return await fetchPromise
    } finally {
      if (cacheKey) {
        this.pendingMessagesFetch.delete(cacheKey)
      }
    }
  }
  
  private async fetchMessagesInternal(
    chatId: string,
    options: { limit?: number; cursor?: string; direction?: 'asc' | 'desc' },
    cacheKey: string | null
  ): Promise<ChatMessage[]> {
    const { limit = 50, cursor, direction = 'asc' } = options
    
    // Get user first
    const user = await this.getCurrentUser()
    
    // Try API route first
    try {
      const params = new URLSearchParams()
      if (limit) params.set('limit', String(limit))
      if (cursor) params.set('cursor', cursor)
      if (direction) params.set('direction', direction)
      
      const headers: Record<string, string> = {}
      if (user) {
        headers['x-user-id'] = user.$id
      }
      
      const res = await fetch(`/api/chats/${chatId}/messages?${params.toString()}`, {
        credentials: 'include', // Include cookies in the request
        headers
      })
      if (res.ok) {
        const data = await res.json()
        const messages = data.messages || []
        
        // Cache the result (only for non-paginated requests)
        if (cacheKey) {
          this.messagesCache.set(cacheKey, { messages, timestamp: Date.now() })
        }
        
        return messages
      }
    } catch (error) {
      console.warn('API messages fetch failed, trying direct access:', error)
    }

    // Fallback to direct access
    await this.initClients()
    
    const { Query } = await import('./client')

    const queries = [
      Query.equal('chat_id', chatId),
      Query.limit(Math.min(limit, 100)),
    ]

    if (direction === 'asc') {
      queries.push(Query.orderAsc('created_at'))
    } else {
      queries.push(Query.orderDesc('created_at'))
    }

    if (cursor) {
      queries.push(Query.cursorAfter(cursor))
    }

    const response = await this.databases.listDocuments(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.chatMessages,
      queries
    )

    const messages = response.documents.map(this.mapMessageDocument)
    
    // Cache the result
    if (cacheKey) {
      this.messagesCache.set(cacheKey, { messages, timestamp: Date.now() })
    }
    
    return messages
  }
  
  // Invalidate caches when data changes
  invalidateChatsCache(): void {
    this.chatsCache.clear()
    console.log('Chats cache invalidated')
  }
  
  invalidateMessagesCache(chatId?: string): void {
    if (chatId) {
      // Remove all cache entries for this chat
      for (const key of this.messagesCache.keys()) {
        if (key.startsWith(`${chatId}:`)) {
          this.messagesCache.delete(key)
        }
      }
    } else {
      this.messagesCache.clear()
    }
    console.log('🗑️ Messages cache invalidated')
  }

  async addMessage(chatId: string, data: {
    role: 'user' | 'assistant' | 'system'
    content: string
    metadata?: any
  }): Promise<ChatMessage> {
    // Get user for the header
    const user = await this.getCurrentUser()
    
    // Use API route for creating messages (handles permissions server-side)
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      }
      if (user) {
        headers['x-user-id'] = user.$id
      }
      
      const res = await fetch(`/api/chats/${chatId}/messages`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          role: data.role,
          content: data.content,
          metadata: data.metadata
        })
      })
      
      if (res.ok) {
        const result = await res.json()
        // Invalidate messages cache for this chat
        this.invalidateMessagesCache(chatId)
        return this.mapMessageDocument(result.message)
      }
      
      // If API fails, throw error
      const error = await res.json().catch(() => ({ error: 'Failed to add message' }))
      throw new Error(error.error || 'Failed to add message')
    } catch (error) {
      console.error('Failed to add message via API:', error)
      throw error
    }
  }

  async getFavorites(userId?: string): Promise<Favorite[]> {
    await this.initClients()
    
    const user = userId ? { $id: userId } : await this.getCurrentUser()
    if (!user) return []

    const { Query } = await import('./client')

    const response = await this.databases.listDocuments(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.favorites,
      [
        Query.equal('user_id', user.$id),
        Query.orderDesc('created_at'),
      ]
    )

    return response.documents.map(this.mapFavoriteDocument)
  }

  async addFavorite(messageId: string, chatId: string): Promise<Favorite> {
    await this.initClients()
    
    const user = await this.getCurrentUser()
    if (!user) throw new Error('Not authenticated')

    const { ID } = await import('./client')

    const doc = await this.databases.createDocument(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.favorites,
      ID.unique(),
      {
        user_id: user.$id,
        message_id: messageId,
        chat_id: chatId,
        created_at: new Date().toISOString(),
      }
    )

    // Update message's is_favorite flag
    await this.databases.updateDocument(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.chatMessages,
      messageId,
      { is_favorite: true }
    )

    return this.mapFavoriteDocument(doc)
  }

  async removeFavorite(messageId: string): Promise<void> {
    await this.initClients()
    
    const user = await this.getCurrentUser()
    if (!user) throw new Error('Not authenticated')

    const { Query } = await import('./client')

    // Find the favorite document
    const response = await this.databases.listDocuments(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.favorites,
      [
        Query.equal('user_id', user.$id),
        Query.equal('message_id', messageId),
      ]
    )

    if (response.documents.length > 0) {
      await this.databases.deleteDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.favorites,
        response.documents[0].$id
      )
    }

    // Update message's is_favorite flag
    try {
      await this.databases.updateDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.chatMessages,
        messageId,
        { is_favorite: false }
      )
    } catch (e) {
      // Message might not exist anymore
    }
  }

  // Alias for backwards compatibility (getMessages = getChatMessages)
  async getMessages(chatId: string): Promise<ChatMessage[]> {
    return this.getChatMessages(chatId, { limit: 1000 })
  }

  // Get a chat by its share token
  async getChatByShareToken(token: string): Promise<Chat | null> {
    await this.initClients()
    
    const { Query } = await import('./client')
    
    try {
      const response = await this.databases.listDocuments(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.chats,
        [
          Query.equal('share_token', token),
          Query.equal('is_public', true),
          Query.limit(1),
        ]
      )
      
      if (response.documents.length === 0) {
        return null
      }
      
      return this.mapChatDocument(response.documents[0])
    } catch (error) {
      console.error('Error getting chat by share token:', error)
      return null
    }
  }

  // Share a chat and get the share token
  async shareChat(chatId: string): Promise<string> {
    const user = await this.getCurrentUser()
    if (!user) throw new Error('Not authenticated')
    
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      }
      headers['x-user-id'] = user.$id
      
      const res = await fetch(`/api/chats/${chatId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers,
        body: JSON.stringify({ action: 'share' })
      })
      
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Failed to share chat' }))
        throw new Error(error.error || 'Failed to share chat')
      }
      
      const result = await res.json()
      return result.share_token
    } catch (error) {
      console.error('Failed to share chat:', error)
      throw error
    }
  }

  // Unshare a chat
  async unshareChat(chatId: string): Promise<void> {
    const user = await this.getCurrentUser()
    if (!user) throw new Error('Not authenticated')
    
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      }
      headers['x-user-id'] = user.$id
      
      const res = await fetch(`/api/chats/${chatId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers,
        body: JSON.stringify({ action: 'unshare' })
      })
      
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Failed to unshare chat' }))
        throw new Error(error.error || 'Failed to unshare chat')
      }
    } catch (error) {
      console.error('Failed to unshare chat:', error)
      throw error
    }
  }

  // Document mapping helpers
  private mapChatDocument(doc: any): Chat {
    return {
      id: doc.$id,
      user_id: doc.user_id,
      profile_id: doc.profile_id,
      mode: doc.mode,
      title: doc.title,
      message_count: doc.message_count || 0,
      last_message_preview: doc.last_message_preview,
      created_at: doc.created_at || doc.$createdAt,
      updated_at: doc.updated_at || doc.$updatedAt,
      last_message_at: doc.last_message_at,
      is_archived: doc.is_archived || false,
      deleted_at: doc.deleted_at,
      is_public: doc.is_public || false,
      share_token: doc.share_token,
      shared_at: doc.shared_at,
    }
  }

  private mapMessageDocument(doc: any): ChatMessage {
    return {
      id: doc.$id,
      chat_id: doc.chat_id,
      role: doc.role,
      content: doc.content,
      metadata: doc.metadata ? (typeof doc.metadata === 'string' ? JSON.parse(doc.metadata) : doc.metadata) : null,
      created_at: doc.created_at || doc.$createdAt,
      is_favorite: doc.is_favorite || false,
    }
  }

  private mapFavoriteDocument(doc: any): Favorite {
    return {
      id: doc.$id,
      user_id: doc.user_id,
      message_id: doc.message_id,
      chat_id: doc.chat_id,
      created_at: doc.created_at || doc.$createdAt,
    }
  }
}

// Singleton instance
let chatServiceInstance: ChatService | null = null

export function getChatService(): ChatService {
  if (!chatServiceInstance) {
    chatServiceInstance = new ChatService()
  }
  return chatServiceInstance
}

// Export the singleton for convenient access
export const chatService = getChatService()
