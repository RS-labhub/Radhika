import type { SupabaseClient, User } from '@supabase/supabase-js'
import { getSupabaseClient } from './client'
import type { Chat, ChatMessage, Favorite } from '@/types/chat'

type GetChatsOptions = {
  mode?: string
  profileId?: string
  includeArchived?: boolean
  limit?: number
}

const CHATS_CACHE_TTL = 30000
const MESSAGES_CACHE_TTL = 15000

export class ChatService {
  private chatsCache = new Map<string, { chats: Chat[]; timestamp: number }>()
  private messagesCache = new Map<string, { messages: ChatMessage[]; timestamp: number }>()
  private pendingChatsFetch = new Map<string, Promise<Chat[]>>()
  private pendingMessagesFetch = new Map<string, Promise<ChatMessage[]>>()

  private get supabase(): SupabaseClient {
    return getSupabaseClient()
  }

  async getCurrentUser(): Promise<User | null> {
    const { data: { session } } = await this.supabase.auth.getSession()
    return session?.user ?? null
  }

  async getChats(options?: GetChatsOptions): Promise<Chat[]>
  async getChats(mode: string, profileId?: string): Promise<Chat[]>
  async getChats(arg1?: string | GetChatsOptions, arg2?: string): Promise<Chat[]> {
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

    const user = await this.getCurrentUser()
    if (!user) return []

    const cacheKey = `${user.id}:${mode || ''}:${profileId || ''}:${includeArchived}:${limit}`

    const cached = this.chatsCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CHATS_CACHE_TTL) {
      return cached.chats
    }

    const pending = this.pendingChatsFetch.get(cacheKey)
    if (pending) return pending

    const fetchPromise = this.fetchChats(user.id, mode, profileId, includeArchived, limit, cacheKey)
    this.pendingChatsFetch.set(cacheKey, fetchPromise)

    try {
      return await fetchPromise
    } finally {
      this.pendingChatsFetch.delete(cacheKey)
    }
  }

  private async fetchChats(
    userId: string,
    mode: string | undefined,
    profileId: string | undefined,
    includeArchived: boolean,
    limit: number,
    cacheKey: string
  ): Promise<Chat[]> {
    let query = this.supabase
      .from('chats')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(Math.min(limit, 100))

    if (mode) query = query.eq('mode', mode)
    if (profileId) query = query.eq('profile_id', profileId)
    if (!includeArchived) query = query.eq('is_archived', false)

    const { data, error } = await query
    if (error) throw error

    const chats = (data || []) as Chat[]
    this.chatsCache.set(cacheKey, { chats, timestamp: Date.now() })
    return chats
  }

  async getChat(chatId: string): Promise<Chat | null> {
    const { data, error } = await this.supabase
      .from('chats')
      .select('*')
      .eq('id', chatId)
      .maybeSingle()

    if (error) {
      if (error.code === '22P02') return null
      throw error
    }
    return (data as Chat | null) ?? null
  }

  async getChatById(chatId: string): Promise<Chat | null> {
    return this.getChat(chatId)
  }

  async createChat(data: { mode: string; title: string; profileId?: string }): Promise<Chat>
  async createChat(mode: string, title: string, profileId?: string, options?: { queueOnFailure?: boolean }): Promise<Chat>
  async createChat(
    arg1: string | { mode: string; title: string; profileId?: string },
    arg2?: string,
    arg3?: string,
    _options?: { queueOnFailure?: boolean }
  ): Promise<Chat> {
    const user = await this.getCurrentUser()
    if (!user) throw new Error('Not authenticated')

    const { mode, title, profileId } = typeof arg1 === 'string'
      ? { mode: arg1, title: arg2 || '', profileId: arg3 }
      : arg1

    const { data, error } = await this.supabase
      .from('chats')
      .insert({
        user_id: user.id,
        mode,
        title,
        profile_id: profileId || null,
        last_message_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) throw new Error(error.message || 'Failed to create chat')

    await this.incrementStats(user.id, mode, 1, 0)
    this.invalidateChatsCache()
    return data as Chat
  }

  async updateChat(chatId: string, updates: Partial<Chat>): Promise<Chat> {
    const updateData: Record<string, unknown> = {}
    if (updates.title !== undefined) updateData.title = updates.title
    if (updates.is_archived !== undefined) updateData.is_archived = updates.is_archived
    if (updates.profile_id !== undefined) updateData.profile_id = updates.profile_id

    const { data, error } = await this.supabase
      .from('chats')
      .update(updateData)
      .eq('id', chatId)
      .select()
      .single()

    if (error) throw new Error(error.message || 'Failed to update chat')

    this.invalidateChatsCache()
    return data as Chat
  }

  async deleteChat(chatId: string, _permanent = false): Promise<void> {
    try {
      const { data: chat, error: fetchError } = await this.supabase
        .from('chats')
        .select('id, user_id, mode, message_count')
        .eq('id', chatId)
        .maybeSingle()

      if (fetchError || !chat) return

      const { error } = await this.supabase.from('chats').delete().eq('id', chatId)
      if (error) throw error

      await this.incrementStats(chat.user_id, chat.mode || 'general', -1, -(chat.message_count || 0))
      this.invalidateChatsCache()
      this.invalidateMessagesCache(chatId)
    } catch (error) {
      console.warn('Failed to delete chat (continuing with local deletion):', chatId, error)
    }
  }

  async deleteAllChats(): Promise<void> {
    const user = await this.getCurrentUser()
    if (!user) throw new Error('Not authenticated')

    const chats = await this.getChats({ includeArchived: true, limit: 100 })
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
    const cacheKey = cursor ? null : `${chatId}:${limit}:${direction}`

    if (cacheKey) {
      const cached = this.messagesCache.get(cacheKey)
      if (cached && Date.now() - cached.timestamp < MESSAGES_CACHE_TTL) {
        return cached.messages
      }

      const pending = this.pendingMessagesFetch.get(cacheKey)
      if (pending) return pending
    }

    const fetchPromise = this.fetchMessages(chatId, options, cacheKey)
    if (cacheKey) this.pendingMessagesFetch.set(cacheKey, fetchPromise)

    try {
      return await fetchPromise
    } finally {
      if (cacheKey) this.pendingMessagesFetch.delete(cacheKey)
    }
  }

  private async fetchMessages(
    chatId: string,
    options: { limit?: number; cursor?: string; direction?: 'asc' | 'desc' },
    cacheKey: string | null
  ): Promise<ChatMessage[]> {
    const { limit = 50, cursor, direction = 'asc' } = options
    const ascending = direction === 'asc'

    let query = this.supabase
      .from('chat_messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending })
      .order('seq_num', { ascending })
      .limit(Math.min(limit, 1000))

    if (cursor) {
      const { data: cursorRow, error: cursorError } = await this.supabase
        .from('chat_messages')
        .select('created_at')
        .eq('id', cursor)
        .maybeSingle()

      if (cursorError) throw cursorError
      if (cursorRow) {
        query = ascending
          ? query.gt('created_at', cursorRow.created_at)
          : query.lt('created_at', cursorRow.created_at)
      }
    }

    const { data, error } = await query
    if (error) throw error

    const messages = (data || []) as ChatMessage[]
    if (cacheKey) this.messagesCache.set(cacheKey, { messages, timestamp: Date.now() })
    return messages
  }

  invalidateChatsCache(): void {
    this.chatsCache.clear()
  }

  invalidateMessagesCache(chatId?: string): void {
    if (!chatId) {
      this.messagesCache.clear()
      return
    }
    for (const key of this.messagesCache.keys()) {
      if (key.startsWith(`${chatId}:`)) this.messagesCache.delete(key)
    }
  }

  async addMessage(chatId: string, data: {
    role: 'user' | 'assistant' | 'system'
    content: string
    metadata?: Record<string, any>
  }): Promise<ChatMessage> {
    const { data: message, error } = await this.supabase
      .from('chat_messages')
      .insert({
        chat_id: chatId,
        role: data.role,
        content: data.content,
        metadata: data.metadata ?? {},
      })
      .select()
      .single()

    if (error) throw new Error(error.message || 'Failed to add message')

    const user = await this.getCurrentUser()
    if (user) await this.incrementStats(user.id, null, 0, 1)

    this.invalidateMessagesCache(chatId)
    this.invalidateChatsCache()
    return message as ChatMessage
  }

  async getFavorites(userId?: string): Promise<Favorite[]> {
    const id = userId ?? (await this.getCurrentUser())?.id
    if (!id) return []

    const { data, error } = await this.supabase
      .from('favorites')
      .select('id, message_id, user_id, created_at, message:chat_messages(id, content, role, created_at, chat:chats(id, title, mode))')
      .eq('user_id', id)
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data || []) as unknown as Favorite[]
  }

  async addFavorite(messageId: string, chatId: string): Promise<Favorite> {
    const user = await this.getCurrentUser()
    if (!user) throw new Error('Not authenticated')

    const { data, error } = await this.supabase
      .from('favorites')
      .insert({ user_id: user.id, message_id: messageId, chat_id: chatId })
      .select()
      .single()

    let favorite = data as Favorite | null
    if (error) {
      if (error.code !== '23505') throw error
      const { data: existing, error: existingError } = await this.supabase
        .from('favorites')
        .select()
        .eq('user_id', user.id)
        .eq('message_id', messageId)
        .single()
      if (existingError) throw existingError
      favorite = existing as Favorite
    }

    await this.supabase.from('chat_messages').update({ is_favorite: true }).eq('id', messageId)
    this.invalidateMessagesCache(chatId)
    return favorite as Favorite
  }

  async removeFavorite(messageId: string): Promise<void> {
    const user = await this.getCurrentUser()
    if (!user) throw new Error('Not authenticated')

    const { error } = await this.supabase
      .from('favorites')
      .delete()
      .eq('user_id', user.id)
      .eq('message_id', messageId)

    if (error) throw error

    await this.supabase.from('chat_messages').update({ is_favorite: false }).eq('id', messageId)
    this.invalidateMessagesCache()
  }

  async getMessages(chatId: string): Promise<ChatMessage[]> {
    return this.getChatMessages(chatId, { limit: 1000 })
  }

  async getChatByShareToken(token: string): Promise<Chat | null> {
    const { data, error } = await this.supabase
      .from('chats')
      .select('*')
      .eq('share_token', token)
      .eq('is_public', true)
      .maybeSingle()

    if (error) {
      console.error('Error getting chat by share token:', error)
      return null
    }
    return (data as Chat | null) ?? null
  }

  async shareChat(chatId: string): Promise<string> {
    const { data, error } = await this.supabase.rpc('share_chat', { chat_id_param: chatId })
    if (error) throw new Error(error.message || 'Failed to share chat')
    this.invalidateChatsCache()
    return data as string
  }

  async unshareChat(chatId: string): Promise<void> {
    const { error } = await this.supabase.rpc('unshare_chat', { chat_id_param: chatId })
    if (error) throw new Error(error.message || 'Failed to unshare chat')
    this.invalidateChatsCache()
  }

  private async incrementStats(userId: string, mode: string | null, chatsInc: number, messagesInc: number): Promise<void> {
    const { error } = await this.supabase.rpc('increment_user_stats', {
      p_user_id: userId,
      p_mode: mode,
      p_chats_inc: chatsInc,
      p_messages_inc: messagesInc,
    })
    if (error) console.warn('Failed to update user stats:', error.message)
  }
}

let chatServiceInstance: ChatService | null = null

export function getChatService(): ChatService {
  if (!chatServiceInstance) {
    chatServiceInstance = new ChatService()
  }
  return chatServiceInstance
}

export const chatService = getChatService()
