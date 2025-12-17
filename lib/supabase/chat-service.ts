import { createClient } from "@/lib/supabase/client"
import type { Chat, ChatMessage, Favorite } from "@/types/chat"

// Utility to add timeout to async operations
function withTimeout<T>(promise: Promise<T>, timeoutMs: number = 15000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Request timeout")), timeoutMs)
    ),
  ])
}

export class ChatService {
  private supabase = createClient()
  private userCache: { user: any; timestamp: number } | null = null
  private readonly CACHE_TTL = 30000 // Cache for 30 seconds (longer cache)

  private isValidUuid(value?: string) {
    if (!value) return false
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  }

  // Cached user retrieval to prevent redundant auth checks
  private async getCachedUser() {
    const now = Date.now()
    
    // Return cached user if still valid
    if (this.userCache && (now - this.userCache.timestamp) < this.CACHE_TTL) {
      return this.userCache.user
    }

    // Try getSession first (local, no network call)
    const { data: { session } } = await this.supabase.auth.getSession()
    
    if (session?.user) {
      this.userCache = { user: session.user, timestamp: now }
      return session.user
    }
    
    // Fallback to getUser (makes network call to verify)
    const { data: { user }, error } = await this.supabase.auth.getUser()
    
    if (error || !user) {
      throw new Error("Not authenticated")
    }

    this.userCache = { user, timestamp: now }
    return user
  }

  // ============ Chats ============
  async createChat(mode: string, title: string, profileId?: string) {
    // Get current user (cached)
    const user = await this.getCachedUser()

    const { data, error } = await this.supabase
      .from("chats")
      .insert({
        user_id: user.id,
        mode,
        title,
        profile_id: profileId,
        last_message_at: new Date().toISOString(),
      } as any)
      .select()
      .single()

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

  async getChats(mode?: string, profileId?: string) {
    // Get current user (cached)
    const user = await this.getCachedUser()
    
    console.log("getChats called for user:", user.id, "mode:", mode, "profileId:", profileId)

    let query = this.supabase
      .from("chats")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_archived", false)
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

    console.log("Executing getChats query...")
    const { data, error } = await query
    
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

    const { data, error } = await this.supabase
      .from("chats")
      .select("*")
      .eq("id", chatId)
      .eq("user_id", user.id)
      .single()

    if (error) {
      console.error("getChatById error:", error)
      throw error
    }
    return data as Chat
  }

  async updateChat(chatId: string, updates: Partial<Chat>) {
    const user = await this.getCachedUser()

    const { data, error } = await this.supabase
      .from("chats")
      // @ts-expect-error - Supabase types not generated yet
      .update(updates as any)
      .eq("id", chatId)
      .eq("user_id", user.id)
      .select()
      .single()

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
      // @ts-expect-error - RPC function not in generated types
      const { error } = await this.supabase.rpc('soft_delete_chat', {
        chat_id_param: chatId,
        user_id_param: user.id
      })

      if (error) {
        console.error("deleteChat db error:", error)
        // If the function doesn't exist, fall back to direct update
        if (error.code === '42883') { // function does not exist
          const { error: updateError } = await this.supabase
            .from("chats")
            // @ts-expect-error
            .update({ is_archived: true } as any)
            .eq("id", chatId)
            .eq("user_id", user.id)
          
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
    const { data: chatsToDelete, error: fetchError } = await this.supabase
      .from("chats")
      .select("id")
      .eq("user_id", user.id)
      .not("deleted_at", "is", null)
      .lt("deleted_at", cutoffDate.toISOString())
    
    if (fetchError) {
      console.error("Error fetching chats to cleanup:", fetchError)
      throw fetchError
    }
    
    if (!chatsToDelete || chatsToDelete.length === 0) {
      return 0
    }
    
    // Permanently delete these chats (cascade will delete messages)
    const chatIds = chatsToDelete.map((c: any) => c.id)
    const { error: deleteError } = await this.supabase
      .from("chats")
      .delete()
      .in("id", chatIds)
      .eq("user_id", user.id)
    
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

    const { error } = await this.supabase
      .from("chats")
      // @ts-expect-error
      .update({ is_archived: true } as any)
      .eq("user_id", user.id)

    if (error) {
      console.error("deleteAllChats error:", error)
      throw error
    }
  }

  // ============ Chat Sharing ============
  async shareChat(chatId: string): Promise<string> {
    const { data, error } = await (this.supabase as any)
      .rpc('share_chat', { chat_id_param: chatId })

    if (error) {
      console.error("shareChat error:", error)
      throw error
    }

    return data as string
  }

  async unshareChat(chatId: string): Promise<void> {
    const { error } = await (this.supabase as any)
      .rpc('unshare_chat', { chat_id_param: chatId })

    if (error) {
      console.error("unshareChat error:", error)
      throw error
    }
  }

  async getChatByShareToken(shareToken: string): Promise<Chat | null> {
    const { data, error } = await this.supabase
      .from("chats")
      .select("*")
      .eq("share_token", shareToken)
      .eq("is_public", true)
      .single()

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
    
    const messageData = {
      ...(this.isValidUuid(id) ? { id } : {}),
      chat_id: chatId,
      role,
      content,
      metadata,
    } as any

    console.log("Inserting message data:", { ...messageData, content: messageData.content.substring(0, 50) + '...' })

    const { data, error } = await this.supabase
      .from("chat_messages")
      .insert(messageData)
      .select()
      .single()

    if (error) {
      console.error("addMessage error:", error)
      throw error
    }

    console.log("Message inserted successfully:", (data as any)?.id)

    // Update last_message_at on chat
    await this.supabase
      .from("chats")
      // @ts-expect-error - Supabase types not generated yet
      .update({ last_message_at: new Date().toISOString() } as any)
      .eq("id", chatId)

    // Increment persisted message counter for the chat owner (best-effort)
    try {
      const res: any = await this.supabase
        .from("chats")
        .select("user_id")
        .eq("id", chatId)
        .single()

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
  }

  async getMessages(chatId: string) {
    const { data, error } = await this.supabase
      .from("chat_messages")
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true })

    if (error) {
      console.error("getMessages error:", error)
      throw error
    }
    return (data as ChatMessage[]) || []
  }

  async updateMessage(messageId: string, updates: Partial<ChatMessage>) {
    const { data, error } = await this.supabase
      .from("chat_messages")
      // @ts-expect-error - Supabase types not generated yet
      .update(updates as any)
      .eq("id", messageId)
      .select()
      .single()

    if (error) {
      console.error("updateMessage error:", error)
      throw error
    }
    return data as ChatMessage
  }

  async deleteMessage(messageId: string) {
    const { error } = await this.supabase
      .from("chat_messages")
      .delete()
      .eq("id", messageId)

    if (error) {
      console.error("deleteMessage error:", error)
      throw error
    }
  }

  // ============ Favorites ============
  async addToFavorites(messageId: string) {
    const user = await this.getCachedUser()
    
    console.log("Adding to favorites:", { messageId, userId: user.id })
    
    const { data, error } = await this.supabase
      .from("favorites")
      .insert({ 
        message_id: messageId,
        user_id: user.id 
      } as any)
      .select()
      .single()

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
    const { error } = await this.supabase
      .from("favorites")
      .delete()
      .eq("message_id", messageId)

    if (error) {
      console.error("removeFromFavorites error:", error)
      throw error
    }

    // Unmark message as favorite
    await this.updateMessage(messageId, { is_favorite: false })
  }

  async getFavorites() {
    const user = await this.getCachedUser()

    const { data, error } = await this.supabase
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
      .order("created_at", { ascending: false })

    if (error) {
      console.error("getFavorites error:", error)
      throw error
    }
    return data || []
  }

  // ============ Bulk Operations ============
  async saveChatHistory(chatId: string, messages: Array<{ id?: string; role: "user" | "assistant" | "system"; content: string; metadata?: Record<string, any> }>) {
    // Delete existing messages for this chat
    const { error: deleteError } = await this.supabase
      .from("chat_messages")
      .delete()
      .eq("chat_id", chatId)

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

    const { error } = await this.supabase
      .from("chat_messages")
      .insert(messagesToInsert as any)

    if (error) {
      console.error("saveChatHistory insert error:", error)
      throw error
    }

    // Update last_message_at
    const { error: updateError } = await this.supabase
      .from("chats")
      // @ts-expect-error - Supabase types not generated yet
      .update({ last_message_at: new Date().toISOString() } as any)
      .eq("id", chatId)

    if (updateError) {
      console.error("saveChatHistory update error:", updateError)
    }
  }
}

// Export singleton instance
export const chatService = new ChatService()
