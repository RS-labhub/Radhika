import { getSupabaseClient } from "@/lib/supabase/client"
import { retryWithReset } from "@/lib/supabase/safe"
import {
  addPendingMessage,
  getPendingMessages,
  removePendingMessages,
  updatePendingMessage,
} from "@/lib/supabase/pending-messages"
import type { Chat, ChatMessage, Favorite } from "@/types/chat"

export class ChatService {
  private get supabase() {
    return getSupabaseClient() as any
  }
  private userCache: { user: any; timestamp: number } | null = null
  private userPromise: Promise<any> | null = null
  private readonly CACHE_TTL = 5 * 60 * 1000
  private readonly STALE_TTL = 24 * 60 * 60 * 1000
  private readonly SESSION_TIMEOUT_MS = 8000
  private pendingFlushPromise: Promise<number> | null = null

  private isValidUuid(value?: string) {
    if (!value) return false
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  }
  
  private isOffline() {
    return typeof navigator !== "undefined" && navigator.onLine === false
  }

  private getErrorMessage(error: unknown) {
    if (error && typeof error === "object" && "message" in error) {
      return String((error as { message?: unknown }).message || "")
    }
    return String(error ?? "")
  }

  private getErrorStatus(error: unknown) {
    if (error && typeof error === "object" && "status" in error) {
      const status = (error as { status?: unknown }).status
      return typeof status === "number" ? status : Number(status)
    }
    return NaN
  }

  private shouldQueueMessage(error: unknown) {
    if (this.isOffline()) return true
    const status = this.getErrorStatus(error)
    if (!Number.isNaN(status)) {
      if (status === 408 || status === 429 || status >= 500) return true
      if (status >= 400 && status < 500) return true
    }
    const message = this.getErrorMessage(error).toLowerCase()
    if (message.includes("timeout") || message.includes("timed out")) return true
    if (message.includes("failed to fetch") || message.includes("network")) return true
    return true
  }

  private buildMessageMetadata(metadata: Record<string, any> | undefined, clientId?: string) {
    if (!clientId) return metadata || null
    const merged = { ...(metadata || {}) }
    if (!merged.client_id) {
      merged.client_id = clientId
    }
    return merged
  }

  private async insertMessage(payload: {
    chatId: string
    role: "user" | "assistant" | "system"
    content: string
    metadata?: Record<string, any> | null
    id?: string
  }) {
    const { chatId, role, content, metadata, id } = payload
    const messageData = {
      ...(this.isValidUuid(id) ? { id } : {}),
      chat_id: chatId,
      role,
      content,
      metadata: metadata ?? null,
    } as any

    // Use longer timeout for large content (e.g., images with base64 data)
    const contentSize = content.length
    const timeout = contentSize > 5000 ? 45000 : 30000
    
    console.log(`insertMessage: content size=${contentSize}, using timeout=${timeout}ms`)

    const { data, error } = await retryWithReset(
      () => this.supabase
        .from("chat_messages")
        .insert(messageData)
        .select("id,chat_id,role,content,metadata,created_at,is_favorite")
        .single(),
      timeout
    ) as any

    if (error) throw error

    // Update chat's last_message_at timestamp
    await retryWithReset(
      () => this.supabase
        .from("chats")
        .update({ last_message_at: new Date().toISOString() } as any)
        .eq("id", chatId),
      15000
    ) as any

    return data as ChatMessage
  }

  async flushPendingMessages(chatId?: string): Promise<number> {
    if (this.pendingFlushPromise) return this.pendingFlushPromise

    this.pendingFlushPromise = (async () => {
      if (this.isOffline()) return 0

      const { data: { session } } = await this.supabase.auth.getSession()
      if (!session?.user) return 0
      const pending = getPendingMessages(chatId, session.user.id)
      if (pending.length === 0) return 0

      const now = Date.now()
      const toRemove: Array<{ id: string; chatId: string }> = []

      for (const item of pending) {
        const lastAttempt = item.lastAttemptAt ? new Date(item.lastAttemptAt).getTime() : 0
        const backoffMs = Math.min(30000, Math.pow(2, item.attempts) * 1000)
        if (lastAttempt && now - lastAttempt < backoffMs) continue

        try {
          await this.insertMessage({
            chatId: item.chatId,
            role: item.role,
            content: item.content,
            metadata: item.metadata || null,
            id: item.id,
          })
          toRemove.push({ id: item.id, chatId: item.chatId })
        } catch (error) {
          updatePendingMessage(item.id, item.chatId, {
            attempts: item.attempts + 1,
            lastAttemptAt: new Date().toISOString(),
          })
          if (!this.shouldQueueMessage(error)) {
            console.warn("Dropping non-retryable pending message:", error)
            toRemove.push({ id: item.id, chatId: item.chatId })
          }
        }
      }

      if (toRemove.length > 0) {
        removePendingMessages(toRemove)
      }

      return toRemove.length
    })()

    try {
      return await this.pendingFlushPromise
    } finally {
      this.pendingFlushPromise = null
    }
  }

  // Cached user retrieval to prevent redundant auth checks
  private async getCachedUser() {
    const now = Date.now()
    
    // Return cached user if still valid
    if (this.userCache && (now - this.userCache.timestamp) < this.CACHE_TTL) {
      return this.userCache.user
    }
    if (this.userPromise) {
      return this.userPromise
    }

    const cachedUser = this.userCache?.user
    const cachedTimestamp = this.userCache?.timestamp ?? 0

    this.userPromise = (async () => {
      if (cachedUser && this.isOffline()) {
        this.userCache = { user: cachedUser, timestamp: Date.now() }
        return cachedUser
      }

      try {
        // Prefer getSession to avoid extra network calls.
        const { data: { session } } = await retryWithReset(
          () => this.supabase.auth.getSession(),
          this.SESSION_TIMEOUT_MS
        ) as any
        
        if (session?.user) {
          this.userCache = { user: session.user, timestamp: Date.now() }
          return session.user
        }
      } catch (error) {
        if (cachedUser && (Date.now() - cachedTimestamp) < this.STALE_TTL) {
          console.warn("Session lookup failed; using cached user.", error)
          this.userCache = { user: cachedUser, timestamp: Date.now() }
          return cachedUser
        }
        throw error
      }

      if (cachedUser && (Date.now() - cachedTimestamp) < this.STALE_TTL) {
        console.warn("No session available; using cached user.")
        this.userCache = { user: cachedUser, timestamp: Date.now() }
        return cachedUser
      }

      throw new Error("Not authenticated")
    })()

    try {
      return await this.userPromise
    } finally {
      this.userPromise = null
    }
  }

  // ============ Chats ============
  async createChat(mode: string, title: string, profileId?: string) {
    // Get current user (cached)
    const user = await this.getCachedUser()

    const { data, error } = await retryWithReset(
      () => this.supabase
        .from("chats")
        .insert({
          user_id: user.id,
          mode,
          title,
          profile_id: profileId,
          last_message_at: new Date().toISOString(),
        } as any)
        .select("id,title,mode,profile_id,last_message_at,created_at,is_archived,deleted_at")
        .single(),
      20000
    ) as any

    if (error) {
      console.error("createChat error:", error)
      throw error
    }
    // Increment persisted counter (best-effort) so deleting chats doesn't remove historical counts
    try {
      // supabase.rpc may be typed with specific RPC signatures; cast to any for custom RPCs
      await (this.supabase as any).rpc("increment_user_stats", {
        p_user_id: (user as any).id,
        p_mode: mode,
        p_chats_inc: 1,
        p_messages_inc: 0,
      })
    } catch (e) {
      console.warn("Failed to increment user_stats after createChat:", e)
    }

    return data as Chat
  }

  async getChats(mode?: string, profileId?: string, limit?: number) {
    // Get current user (cached)
    const user = await this.getCachedUser()
    
    console.log("getChats called for user:", user.id, "mode:", mode, "profileId:", profileId, "limit:", limit)

    console.log("Executing getChats query...")
    const { data, error } = await retryWithReset(
      () => {
        let query = this.supabase
          .from("chats")
          .select("id,title,mode,profile_id,last_message_at,created_at,is_archived,deleted_at")
          .eq("user_id", user.id)
          .eq("is_archived", false)
          .is("deleted_at", null)
          .order("last_message_at", { ascending: false })

        if (mode) query = query.eq("mode", mode)
        
        // Filter by profile: if profileId is provided, get only those chats
        // If profileId is null/undefined, get only chats with null profile_id (default profile)
        if (profileId !== undefined) {
          if (profileId === null) {
            query = query.is("profile_id", null)
          } else {
            query = query.eq("profile_id", profileId)
          }
        }

        // Add limit if specified (improves performance for initial loads)
        // Default to 20 most recent chats if no limit specified (reduced from 30)
        const effectiveLimit = limit || 20
        query = query.limit(effectiveLimit)

        return query
      },
      35000 // Increased to 35s to allow fetch timeout (30s) + retry buffer
    ) as any
    
    if (error) {
      console.error("getChats error:", error)
      throw error
    }
    console.log("getChats successful, found", data.length, "chats")
    
    // Filter out soft-deleted chats on the client side if deleted_at field exists
    const filteredData = (data as Chat[])?.filter((chat: any) => {
      // If deleted_at doesn't exist or is null, include the chat
      return !chat.deleted_at
    }) || []
    
    return filteredData
  }

  async getChatById(chatId: string) {
    const user = await this.getCachedUser()

    const { data, error } = await retryWithReset(
      () => this.supabase
        .from("chats")
        .select("*")
        .eq("id", chatId)
        .eq("user_id", user.id)
        .single(),
      10000
    ) as any

    if (error) {
      console.error("getChatById error:", error)
      throw error
    }
    return data as Chat
  }

  async updateChat(chatId: string, updates: Partial<Chat>) {
    const user = await this.getCachedUser()

    const { data, error } = await retryWithReset(
      () => this.supabase
        .from("chats")
        .update(updates as any)
        .eq("id", chatId)
        .eq("user_id", user.id)
        .select()
        .single(),
      10000
    ) as any

    if (error) {
      console.error("updateChat error:", error)
      throw error
    }
    return data as Chat
  }

  async deleteChat(chatId: string) {
    const user = await this.getCachedUser()

    // Use the soft_delete_chat RPC function to bypass RLS issues
    try {
      const { error } = await retryWithReset(
        () => this.supabase.rpc('soft_delete_chat', {
        chat_id_param: chatId,
        user_id_param: user.id
      }),
        10000
      ) as any

      if (error) {
        console.error("deleteChat db error:", error)
        // If the function doesn't exist, fall back to direct update
        if (error.code === '42883') { // function does not exist
          const { error: updateError } = await retryWithReset(
            () => this.supabase
              .from("chats")
              .update({ is_archived: true } as any)
              .eq("id", chatId)
              .eq("user_id", user.id),
            10000
          ) as any
          
          if (updateError) {
            console.error("deleteChat (archive fallback) error:", updateError)
            throw new Error(`Failed to archive chat: ${updateError.message}`)
          }
        } else {
          throw new Error(`Failed to delete chat: ${error.message}`)
        }
      }
    } catch (err) {
      console.error("deleteChat error:", err)
      throw err
    }
  }

  // Permanently delete chats that have been soft-deleted for more than 2 days
  async cleanupOldDeletedChats(): Promise<number> {
    const user = await this.getCachedUser()
    
    // Calculate the cutoff date (2 days ago)
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - 2)
    
    // Get chats to delete
    const { data: chatsToDelete, error: fetchError } = await retryWithReset(
      () => this.supabase
        .from("chats")
        .select("id")
        .eq("user_id", user.id)
        .not("deleted_at", "is", null)
        .lt("deleted_at", cutoffDate.toISOString()),
      10000
    ) as any
    
    if (fetchError) {
      console.error("Error fetching chats to cleanup:", fetchError)
      throw fetchError
    }
    
    if (!chatsToDelete || chatsToDelete.length === 0) {
      return 0
    }
    
    // Permanently delete these chats (cascade will delete messages)
    const chatIds = chatsToDelete.map((c: any) => c.id)
    const { error: deleteError } = await retryWithReset(
      () => this.supabase
        .from("chats")
        .delete()
        .in("id", chatIds)
        .eq("user_id", user.id),
      10000
    ) as any
    
    if (deleteError) {
      console.error("Error deleting old chats:", deleteError)
      throw deleteError
    }
    
    console.log(`Cleaned up ${chatsToDelete.length} old deleted chats`)
    return chatsToDelete.length
  }

  async archiveChat(chatId: string) {
    return this.updateChat(chatId, { is_archived: true })
  }

  async deleteAllChats() {
    const user = await this.getCachedUser()

    const { error } = await retryWithReset(
      () => this.supabase
        .from("chats")
        .update({ is_archived: true } as any)
        .eq("user_id", user.id),
      10000
    ) as any

    if (error) {
      console.error("deleteAllChats error:", error)
      throw error
    }
  }

  // ============ Chat Sharing ============
  async shareChat(chatId: string): Promise<string> {
    const { data, error } = await retryWithReset(
      () => (this.supabase as any)
        .rpc('share_chat', { chat_id_param: chatId }),
      10000
    ) as any

    if (error) {
      console.error("shareChat error:", error)
      throw error
    }

    return data as string
  }

  async unshareChat(chatId: string): Promise<void> {
    const { error } = await retryWithReset(
      () => (this.supabase as any)
        .rpc('unshare_chat', { chat_id_param: chatId }),
      10000
    ) as any

    if (error) {
      console.error("unshareChat error:", error)
      throw error
    }
  }

  async getChatByShareToken(shareToken: string): Promise<Chat | null> {
    const { data, error } = await retryWithReset(
      () => this.supabase
        .from("chats")
        .select("*")
        .eq("share_token", shareToken)
        .eq("is_public", true)
        .single(),
      10000
    ) as any

    if (error) {
      if (error.code === 'PGRST116') {
        // Not found
        return null
      }
      console.error("getChatByShareToken error:", error)
      throw error
    }

    return data as Chat
  }

  // ============ Messages ============
  async addMessage(chatId: string, role: "user" | "assistant" | "system", content: string, metadata?: Record<string, any>, id?: string) {
    console.log("chatService.addMessage called:", { chatId, role, contentLength: content.length, hasId: !!id })
    
    const localId = typeof id === "string" && id ? id : `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const messageMetadata = this.buildMessageMetadata(
      metadata,
      this.isValidUuid(localId) ? undefined : localId
    )

    console.log("Inserting message data:", { chatId, role, contentPreview: content.substring(0, 50) + "..." })

    try {
      const data = await this.insertMessage({
        chatId,
        role,
        content,
        metadata: messageMetadata,
        id,
      })

      console.log("Message inserted successfully:", (data as any)?.id)

      // Increment persisted message counter for the chat owner (best-effort)
      try {
        const res: any = await retryWithReset(
          () => this.supabase
            .from("chats")
            .select("user_id")
            .eq("id", chatId)
            .single(),
          10000
        ) as any

        const chatRow = res?.data
        const chatErr = res?.error

        if (!chatErr && chatRow && chatRow.user_id) {
          try {
            await (this.supabase as any).rpc("increment_user_stats", {
              p_user_id: chatRow.user_id,
              p_mode: null,
              p_chats_inc: 0,
              p_messages_inc: 1,
            })
          } catch (rpcErr) {
            console.warn("Failed to increment user_stats after addMessage (rpc):", rpcErr)
          }
        }
      } catch (e) {
        console.warn("Failed to increment user_stats after addMessage:", e)
      }

      return data as ChatMessage
    } catch (error) {
      console.error("addMessage error:", error)
      if (this.shouldQueueMessage(error)) {
        let userId = this.userCache?.user?.id
        if (!userId) {
          try {
            const { data: { session } } = await this.supabase.auth.getSession()
            userId = session?.user?.id
          } catch {
            userId = undefined
          }
        }
        addPendingMessage({
          id: localId,
          chatId,
          userId,
          role,
          content,
          metadata: messageMetadata || undefined,
          createdAt: new Date().toISOString(),
          attempts: 0,
        })
        console.warn("Message queued for retry:", { chatId, id: localId, role })
        return null
      }
      throw error
    }
  }

  async getMessages(chatId: string, options?: { limit?: number }) {
    const limit = options?.limit ?? 200
    if (!limit) return []

    const { data, error } = await retryWithReset(
      () => this.supabase
        .from("chat_messages")
        .select("id,chat_id,role,content,metadata,created_at,is_favorite")
        .eq("chat_id", chatId)
        .order("created_at", { ascending: false })
        .limit(limit),
      10000
    ) as any

    if (error) {
      console.error("getMessages error:", error)
      throw error
    }
    const messages = (data as ChatMessage[]) || []
    return messages.reverse()
  }

  async updateMessage(messageId: string, updates: Partial<ChatMessage>) {
    const { data, error } = await retryWithReset(
      () => this.supabase
        .from("chat_messages")
        .update(updates as any)
        .eq("id", messageId)
        .select()
        .single(),
      10000
    ) as any

    if (error) {
      console.error("updateMessage error:", error)
      throw error
    }
    return data as ChatMessage
  }

  async deleteMessage(messageId: string) {
    const { error } = await retryWithReset(
      () => this.supabase
        .from("chat_messages")
        .delete()
        .eq("id", messageId),
      10000
    ) as any

    if (error) {
      console.error("deleteMessage error:", error)
      throw error
    }
  }

  // ============ Favorites ============
  async addToFavorites(messageId: string) {
    const user = await this.getCachedUser()
    
    console.log("Adding to favorites:", { messageId, userId: user.id })
    
    const { data, error } = await retryWithReset(
      () => this.supabase
        .from("favorites")
        .insert({ 
          message_id: messageId,
          user_id: user.id 
        } as any)
        .select()
        .single(),
      10000
    ) as any

    if (error) {
      // Already favorited, ignore
      if (error.code === "23505") {
        console.log("Message already favorited, skipping")
        return null
      }
      console.error("addToFavorites error:", error, "Details:", JSON.stringify(error, null, 2))
      throw error
    }

    console.log("Added to favorites successfully")
    
    // Mark message as favorite
    await this.updateMessage(messageId, { is_favorite: true })

    return data as Favorite
  }

  async removeFromFavorites(messageId: string) {
    const { error } = await retryWithReset(
      () => this.supabase
        .from("favorites")
        .delete()
        .eq("message_id", messageId),
      10000
    ) as any

    if (error) {
      console.error("removeFromFavorites error:", error)
      throw error
    }

    // Unmark message as favorite
    await this.updateMessage(messageId, { is_favorite: false })
  }

  async getFavorites() {
    const user = await this.getCachedUser()

    const { data, error } = await retryWithReset(
      () => this.supabase
        .from("favorites")
        .select(`
          *,
          chat_messages!inner (
            *,
            chats!inner (
              user_id
            )
          )
        `)
        .eq("chat_messages.chats.user_id", user.id)
        .order("created_at", { ascending: false }),
      10000
    ) as any

    if (error) {
      console.error("getFavorites error:", error)
      throw error
    }
    return data || []
  }

  // ============ Bulk Operations ============
  async saveChatHistory(chatId: string, messages: Array<{ id?: string; role: "user" | "assistant" | "system"; content: string; metadata?: Record<string, any> }>) {
    // Delete existing messages for this chat
    const { error: deleteError } = await retryWithReset(
      () => this.supabase
        .from("chat_messages")
        .delete()
        .eq("chat_id", chatId),
      10000
    ) as any

    if (deleteError) {
      console.error("saveChatHistory delete error:", deleteError)
    }

    // Insert all messages
    const messagesToInsert = messages.map((msg) => ({
      ...(this.isValidUuid(msg.id) ? { id: msg.id } : {}),
      chat_id: chatId,
      role: msg.role,
      content: msg.content,
      metadata: msg.metadata,
    }))

    const { error } = await retryWithReset(
      () => this.supabase
        .from("chat_messages")
        .insert(messagesToInsert as any),
      10000
    ) as any

    if (error) {
      console.error("saveChatHistory insert error:", error)
      throw error
    }

    // Update last_message_at
    const { error: updateError } = await retryWithReset(
      () => this.supabase
        .from("chats")
        .update({ last_message_at: new Date().toISOString() } as any)
        .eq("id", chatId),
      10000
    ) as any

    if (updateError) {
      console.error("saveChatHistory update error:", updateError)
    }
  }
}

// Export singleton instance
export const chatService = new ChatService()
