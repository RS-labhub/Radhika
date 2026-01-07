import { createClient } from "@/lib/supabase/client"
import type { Chat, ChatMessage, Favorite } from "@/types/chat"

// Helper to check if a string is a valid UUID
function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(str)
}

// Check if error is a timeout or network error that should be retried
function isRetryableError(error: any): boolean {
  if (!error) return false
  
  // Abort is NEVER retryable - it's intentional cancellation
  if (isAbortError(error)) return false
  
  const message = error.message?.toLowerCase() || ""
  const code = error.code?.toString() || ""
  const status = error.status?.toString() || ""
  const name = error.name?.toLowerCase() || ""
  
  // Network/connection errors
  if (
    message.includes("timeout") ||
    message.includes("network") ||
    message.includes("fetch") ||
    message.includes("connection") ||
    message.includes("failed to fetch") ||
    message.includes("load failed") ||
    message.includes("socket") ||
    message.includes("econnrefused") ||
    message.includes("dns") ||
    name.includes("typeerror") // Often indicates network failure
  ) {
    return true
  }
  
  // Supabase/Postgres error codes
  if (
    code === "PGRST301" || // Supabase timeout
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    code === "ENOTFOUND" ||
    code === "ECONNREFUSED" ||
    code === "EAI_AGAIN" ||
    code === "57014" || // query_canceled
    code === "57P01" || // admin_shutdown
    code === "08000" || // connection_exception
    code === "08003" || // connection_does_not_exist
    code === "08006" // connection_failure
  ) {
    return true
  }
  
  // HTTP status codes that indicate temporary failures
  if (
    status === "408" || // Request timeout
    status === "429" || // Too many requests
    status === "500" || // Server error
    status === "502" || // Bad gateway
    status === "503" || // Service unavailable
    status === "504"    // Gateway timeout
  ) {
    return true
  }
  
  return false
}

// Check if error is an abort (user-initiated cancellation)
function isAbortError(error: any): boolean {
  if (!error) return false
  return (
    error.name === "AbortError" ||
    error.code === "ABORT_ERR" ||
    error.message?.toLowerCase().includes("aborted") ||
    error.message?.toLowerCase().includes("abort")
  )
}

export class ChatService {
  // Fix 1: Make Supabase client resettable (not a static singleton)
  private supabase: ReturnType<typeof createClient>
  private userCache: { user: any; timestamp: number } | null = null
  // Increased cache TTL to 2 minutes to reduce auth calls
  private readonly CACHE_TTL = 120000 // Cache for 2 minutes
  
  // Fix: Request generation for stale request protection
  private generation = 0
  
  // Fix 1: AbortController per generation - cancels ALL in-flight requests on refresh
  private abortController = new AbortController()

  constructor() {
    this.supabase = createClient()
  }

  // Fix 1: Hard reset method - mimics what a hard refresh does
  private resetSupabase() {
    console.log("🔄 Resetting Supabase client...")
    this.supabase = createClient()
    this.userCache = null
  }

  // Internal hard reset - aborts everything, increments generation
  // Only call when session is truly invalid or user explicitly refreshes
  private hardReset() {
    console.log("🔄 ChatService hardReset - aborting in-flight requests, incrementing generation, resetting client")
    this.generation++
    this.abortController.abort()
    this.abortController = new AbortController()
    this.resetSupabase()
  }

  // Public refresh method for soft "hard refresh"
  // This is the ONLY place external callers should use
  refresh() {
    this.hardReset()
  }

  // Get current generation for stale request checks
  getGeneration() {
    return this.generation
  }
  
  // Check if a request is stale (generation changed during execution)
  isStale(capturedGeneration: number): boolean {
    return capturedGeneration !== this.generation
  }
  
  // SINGLE abort handler - every request goes through this
  // Signal is passed to buildQuery so queries MUST attach it
  private async executeWithAbort<T>(
    buildQuery: (signal: AbortSignal) => PromiseLike<T>,
    timeoutMs = 15000
  ): Promise<T> {
    const mainSignal = this.abortController.signal
    
    if (mainSignal.aborted) {
      throw new DOMException("Request aborted", "AbortError")
    }
    
    // Create a request-specific controller for timeout
    const controller = new AbortController()
    
    // Link to main abort controller - when refresh() is called, abort this request
    const onMainAbort = () => controller.abort()
    mainSignal.addEventListener("abort", onMainAbort)
    
    // Set up timeout - abort if request takes too long
    const timeoutId = setTimeout(() => {
      controller.abort()
    }, timeoutMs)
    
    try {
      return await buildQuery(controller.signal)
    } catch (err: any) {
      // Normalize abort errors - Supabase may throw different error types on abort
      if (controller.signal.aborted) {
        throw new DOMException("Request aborted", "AbortError")
      }
      throw err
    } finally {
      clearTimeout(timeoutId)
      mainSignal.removeEventListener("abort", onMainAbort)
    }
  }
  
  // Timeout wrapper for auth calls (which don't support AbortSignal)
  // Increased timeout to 20 seconds for network calls
  private withAuthTimeout<T>(promise: Promise<T>, timeoutMs = 20000): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error("Auth timeout")), timeoutMs)
      ),
    ])
  }

  private isValidUuid(value?: string) {
    if (!value) return false
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  }

  // Invalidate auth cache on failure
  // Cached user retrieval to prevent redundant auth checks
  private async getCachedUser() {
    const now = Date.now()
    
    // Return cached user if still valid (cache for 2 minutes)
    if (this.userCache && (now - this.userCache.timestamp) < this.CACHE_TTL) {
      return this.userCache.user
    }

    try {
      // Try getSession first - this is LOCAL and should NOT timeout
      // getSession reads from localStorage/memory, no network call
      const { data: { session } } = await this.supabase.auth.getSession()
      
      if (session?.user) {
        this.userCache = { user: session.user, timestamp: now }
        return session.user
      }
      
      // Only use timeout for getUser (which makes a network call)
      // If this times out, we'll throw but local-first should still work
      try {
        const { data: { user }, error } = await this.withAuthTimeout(
          this.supabase.auth.getUser(),
          20000 // 20 second timeout for network call
        )
        
        if (error || !user) {
          // Clear cache and hard reset ONLY on actual auth failure (session invalid)
          this.userCache = null
          this.hardReset()
          throw new Error("Not authenticated")
        }

        this.userCache = { user, timestamp: now }
        return user
      } catch (networkErr: any) {
        // If getUser times out but we had no session, user is likely not authenticated
        if (networkErr.message === "Auth timeout") {
          console.warn("⚠️ Auth network call timed out - user may need to re-login")
          throw new Error("Auth timeout - please check your connection")
        }
        throw networkErr
      }
    } catch (err: any) {
      // Only clear cache on actual auth errors, not timeouts
      if (err.message !== "Auth timeout - please check your connection") {
        this.userCache = null
      }
      
      // Only hard reset on actual auth failure, NOT on timeout or network errors
      if (err.message === "Not authenticated") {
        this.hardReset()
      }
      
      throw err
    }
  }

  // ============ Chats ============
  async createChat(mode: string, title: string, profileId?: string, options?: { queueOnFailure?: boolean; alwaysQueue?: boolean }): Promise<Chat> {
    // Capture generation for stale check
    const gen = this.generation
    
    // Get current user (cached)
    const user = await this.getCachedUser()

    // Helper to queue chat creation
    const queueChatCreation = async (errorMsg: string) => {
      console.log("⏳ Queueing chat creation for later retry...")
      const { messageQueueService } = await import("@/lib/services/message-queue")
      const queueId = messageQueueService.queueChat(mode, title, profileId, errorMsg)
      
      // Return a temporary chat object so the UI doesn't break
      return {
        id: `pending_${queueId}`,
        user_id: user.id,
        mode,
        title,
        profile_id: profileId,
        last_message_at: new Date().toISOString(),
        is_archived: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as Chat
    }

    try {
      // Use executeWithAbort - signal is passed so query MUST use it
      const result = await this.executeWithAbort(
        (signal) => this.supabase
          .from("chats")
          .insert({
            user_id: user.id,
            mode,
            title,
            profile_id: profileId,
            last_message_at: new Date().toISOString(),
          } as any)
          .select()
          .abortSignal(signal)
          .single()
      )
      
      const { data, error } = result as any

      // Stale means ignore result, always
      if (this.isStale(gen)) {
        throw new DOMException("Request aborted", "AbortError")
      }

      if (error) {
        console.error("createChat error:", error)
        
        // Queue on failure if: alwaysQueue is true, OR (queueOnFailure is true AND it's a retryable error)
        const shouldQueue = options?.alwaysQueue || (options?.queueOnFailure && isRetryableError(error))
        if (shouldQueue) {
          return await queueChatCreation(error.message || "Database error")
        }
        
        throw error
      }
      
      // Increment persisted counter (best-effort) - RPC doesn't support abortSignal
      // Call directly, don't wrap in executeWithAbort
      try {
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
    } catch (err: any) {
      // Don't log abort errors as failures
      if (isAbortError(err)) {
        throw err
      }
      
      // Queue on failure if: alwaysQueue is true, OR (queueOnFailure is true AND it's a retryable error)
      const shouldQueue = options?.alwaysQueue || (options?.queueOnFailure && isRetryableError(err))
      if (shouldQueue) {
        console.log("⏳ Queueing chat creation for later retry due to error:", err.message)
        return await queueChatCreation(err.message || "Unknown error")
      }
      
      throw err
    }
  }

  async getChats(mode?: string, profileId?: string) {
    // Capture generation for stale check
    const gen = this.generation
    
    // Get current user (cached)
    const user = await this.getCachedUser()
    
    console.log("getChats called for user:", user.id, "mode:", mode, "profileId:", profileId)

    console.log("Executing getChats query...")
    
    try {
      const result = await this.executeWithAbort((signal) => {
        let query = this.supabase
          .from("chats")
          .select("*")
          .eq("user_id", user.id)
          .eq("is_archived", false)
          .order("last_message_at", { ascending: false })

        if (mode) query = query.eq("mode", mode)
        
        if (profileId !== undefined) {
          if (profileId === null) {
            query = query.is("profile_id", null)
          } else {
            query = query.eq("profile_id", profileId)
          }
        }
        return query.abortSignal(signal)
      })
      
      const { data, error } = result as any
      
      // Stale means ignore result, always
      if (this.isStale(gen)) {
        throw new DOMException("Request aborted", "AbortError")
      }
      
      if (error) {
        console.error("getChats error:", error)
        throw error
      }
      console.log("getChats successful, found", data.length, "chats")
      
      // Filter out soft-deleted chats on the client side if deleted_at field exists
      const filteredData = (data as Chat[])?.filter((chat: any) => {
        return !chat.deleted_at
      }) || []
      
      return filteredData
    } catch (err: any) {
      if (isAbortError(err)) throw err
      throw err
    }
  }

  async getChatById(chatId: string) {
    const gen = this.generation
    const user = await this.getCachedUser()

    try {
      const result = await this.executeWithAbort(
        (signal) => this.supabase
          .from("chats")
          .select("*")
          .eq("id", chatId)
          .eq("user_id", user.id)
          .abortSignal(signal)
          .single()
      )
      
      const { data, error } = result as any

      // Stale means ignore result, always
      if (this.isStale(gen)) {
        throw new DOMException("Request aborted", "AbortError")
      }

      if (error) {
        console.error("getChatById error:", error)
        throw error
      }
      return data as Chat
    } catch (err: any) {
      if (isAbortError(err)) throw err
      throw err
    }
  }

  async updateChat(chatId: string, updates: Partial<Chat>) {
    const user = await this.getCachedUser()

    try {
      const result = await this.executeWithAbort(
        (signal) => this.supabase
          .from("chats")
          // @ts-expect-error - Supabase types not generated yet
          .update(updates as any)
          .eq("id", chatId)
          .eq("user_id", user.id)
          .select()
          .abortSignal(signal)
          .single()
      )
      
      const { data, error } = result as any

      if (error) {
        console.error("updateChat error:", error)
        throw error
      }
      return data as Chat
    } catch (err: any) {
      if (isAbortError(err)) throw err
      throw err
    }
  }

  async deleteChat(chatId: string) {
    const user = await this.getCachedUser()

    // Use the soft_delete_chat RPC function to bypass RLS issues
    // RPC calls do NOT support abortSignal - call directly
    try {
      const { error } = await (this.supabase as any).rpc('soft_delete_chat', {
        chat_id_param: chatId,
        user_id_param: user.id
      })

      if (error) {
        console.error("deleteChat db error:", error)
        // If the function doesn't exist, fall back to direct update
        if (error.code === '42883') { // function does not exist
          const fallbackResult = await this.executeWithAbort(
            (signal) => this.supabase
              .from("chats")
              // @ts-expect-error
              .update({ is_archived: true } as any)
              .eq("id", chatId)
              .eq("user_id", user.id)
              .abortSignal(signal)
          )
          
          const { error: updateError } = fallbackResult as any
          
          if (updateError) {
            console.error("deleteChat (archive fallback) error:", updateError)
            throw new Error(`Failed to archive chat: ${updateError.message}`)
          }
        } else {
          throw new Error(`Failed to delete chat: ${error.message}`)
        }
      }
    } catch (err: any) {
      console.error("deleteChat error:", err)
      if (isAbortError(err)) throw err
      throw err
    }
  }

  // Permanently delete chats that have been soft-deleted for more than 2 days
  async cleanupOldDeletedChats(): Promise<number> {
    const user = await this.getCachedUser()
    
    // Calculate the cutoff date (2 days ago)
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - 2)
    
    try {
      // Get chats to delete
      const fetchResult = await this.executeWithAbort(
        (signal) => this.supabase
          .from("chats")
          .select("id")
          .eq("user_id", user.id)
          .not("deleted_at", "is", null)
          .lt("deleted_at", cutoffDate.toISOString())
          .abortSignal(signal)
      )
      
      const { data: chatsToDelete, error: fetchError } = fetchResult as any
      
      if (fetchError) {
        console.error("Error fetching chats to cleanup:", fetchError)
        throw fetchError
      }
      
      if (!chatsToDelete || chatsToDelete.length === 0) {
        return 0
      }
      
      // Permanently delete these chats (cascade will delete messages)
      const chatIds = chatsToDelete.map((c: any) => c.id)
      const deleteResult = await this.executeWithAbort(
        (signal) => this.supabase
          .from("chats")
          .delete()
          .in("id", chatIds)
          .eq("user_id", user.id)
          .abortSignal(signal)
      )
      
      const { error: deleteError } = deleteResult as any
      
      if (deleteError) {
        console.error("Error deleting old chats:", deleteError)
        throw deleteError
      }
      
      console.log(`Cleaned up ${chatsToDelete.length} old deleted chats`)
      return chatsToDelete.length
    } catch (err: any) {
      if (isAbortError(err)) throw err
      throw err
    }
  }

  async archiveChat(chatId: string) {
    return this.updateChat(chatId, { is_archived: true })
  }

  async deleteAllChats() {
    const user = await this.getCachedUser()

    try {
      const result = await this.executeWithAbort(
        (signal) => this.supabase
          .from("chats")
          // @ts-expect-error
          .update({ is_archived: true } as any)
          .eq("user_id", user.id)
          .abortSignal(signal)
      )
      
      const { error } = result as any

      if (error) {
        console.error("deleteAllChats error:", error)
        throw error
      }
    } catch (err: any) {
      if (isAbortError(err)) throw err
      throw err
    }
  }

  // ============ Chat Sharing ============
  // RPC calls do NOT support abortSignal - call directly
  async shareChat(chatId: string): Promise<string> {
    try {
      const { data, error } = await (this.supabase as any).rpc('share_chat', { chat_id_param: chatId })

      if (error) {
        console.error("shareChat error:", error)
        throw error
      }

      return data as string
    } catch (err: any) {
      throw err
    }
  }

  async unshareChat(chatId: string): Promise<void> {
    try {
      const { error } = await (this.supabase as any).rpc('unshare_chat', { chat_id_param: chatId })

      if (error) {
        console.error("unshareChat error:", error)
        throw error
      }
    } catch (err: any) {
      throw err
    }
  }

  async getChatByShareToken(shareToken: string): Promise<Chat | null> {
    try {
      const result = await this.executeWithAbort(
        (signal) => this.supabase
          .from("chats")
          .select("*")
          .eq("share_token", shareToken)
          .eq("is_public", true)
          .abortSignal(signal)
          .single()
      )
      
      const { data, error } = result as any

      if (error) {
        if (error.code === 'PGRST116') {
          // Not found
          return null
        }
        console.error("getChatByShareToken error:", error)
        throw error
      }

      return data as Chat
    } catch (err: any) {
      if (isAbortError(err)) throw err
      // Return null for not found errors during catch
      if (err?.code === 'PGRST116') {
        return null
      }
      throw err
    }
  }

  // ============ Messages ============
  async addMessage(
    chatId: string, 
    role: "user" | "assistant" | "system", 
    content: string, 
    metadata?: Record<string, any>, 
    id?: string,
    options?: { queueOnFailure?: boolean; alwaysQueue?: boolean }
  ): Promise<ChatMessage> {
    const gen = this.generation
    console.log("chatService.addMessage called:", { chatId, role, contentLength: content.length, hasId: !!id })
    
    const messageData = {
      ...(this.isValidUuid(id) ? { id } : {}),
      chat_id: chatId,
      role,
      content,
      metadata,
    } as any

    // Helper to queue message
    const queueMessage = async (errorMsg: string) => {
      console.log("⏳ Queueing message for later retry...")
      const { messageQueueService } = await import("@/lib/services/message-queue")
      messageQueueService.queueMessage(chatId, role, content, metadata, id, errorMsg)
      
      return {
        id: id || `pending_${Date.now()}`,
        chat_id: chatId,
        role,
        content,
        metadata,
        created_at: new Date().toISOString(),
        is_favorite: false,
      } as ChatMessage
    }

    console.log("Inserting message data:", { ...messageData, content: messageData.content.substring(0, 50) + '...' })

    try {
      const result = await this.executeWithAbort(
        (signal) => this.supabase
          .from("chat_messages")
          .insert(messageData)
          .select()
          .abortSignal(signal)
          .single()
      )
      
      const { data, error } = result as any

      // Stale means ignore result, always
      if (this.isStale(gen)) {
        throw new DOMException("Request aborted", "AbortError")
      }

      if (error) {
        console.error("addMessage error:", error)
        
        // Queue on failure if: alwaysQueue is true, OR (queueOnFailure is true AND it's a retryable error)
        const shouldQueue = options?.alwaysQueue || (options?.queueOnFailure && isRetryableError(error))
        if (shouldQueue) {
          return await queueMessage(error.message || "Database error")
        }
        
        throw error
      }

      console.log("Message inserted successfully:", (data as any)?.id)

      // Update last_message_at on chat (best-effort, don't fail if this errors)
      try {
        await this.executeWithAbort(
          (signal) => this.supabase
            .from("chats")
            // @ts-expect-error - Supabase types not generated yet
            .update({ last_message_at: new Date().toISOString() } as any)
            .eq("id", chatId)
            .abortSignal(signal),
          10000
        )
      } catch (updateErr) {
        console.warn("Failed to update last_message_at:", updateErr)
      }

      // Increment persisted message counter for the chat owner (best-effort)
      // This is independent background work, don't tie to abort logic
      try {
        const res = await this.executeWithAbort(
          (signal) => this.supabase
            .from("chats")
            .select("user_id")
            .eq("id", chatId)
            .abortSignal(signal)
            .single(),
          10000
        ) as any

        const chatRow = res?.data
        const chatErr = res?.error

        if (!chatErr && chatRow && chatRow.user_id) {
          // RPC call - best effort, call directly without abort wrapper
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
    } catch (err: any) {
      if (isAbortError(err)) throw err
      
      // Queue on failure if: alwaysQueue is true, OR (queueOnFailure is true AND it's a retryable error)
      const shouldQueue = options?.alwaysQueue || (options?.queueOnFailure && isRetryableError(err))
      if (shouldQueue) {
        console.log("⏳ Queueing message for later retry due to error:", err.message)
        return await queueMessage(err.message || "Unknown error")
      }
      
      throw err
    }
  }

  async getMessages(chatId: string) {
    const gen = this.generation
    
    try {
      const result = await this.executeWithAbort(
        (signal) => this.supabase
          .from("chat_messages")
          .select("*")
          .eq("chat_id", chatId)
          .order("created_at", { ascending: true })
          .abortSignal(signal)
      )
      
      const { data, error } = result as any

      // Stale means ignore result, always
      if (this.isStale(gen)) {
        throw new DOMException("Request aborted", "AbortError")
      }

      if (error) {
        console.error("getMessages error:", error)
        throw error
      }
      return (data as ChatMessage[]) || []
    } catch (err: any) {
      if (isAbortError(err)) throw err
      throw err
    }
  }

  async updateMessage(messageId: string, updates: Partial<ChatMessage>) {
    try {
      const result = await this.executeWithAbort(
        (signal) => this.supabase
          .from("chat_messages")
          // @ts-expect-error - Supabase types not generated yet
          .update(updates as any)
          .eq("id", messageId)
          .select()
          .abortSignal(signal)
          .single()
      )
      
      const { data, error } = result as any

      if (error) {
        console.error("updateMessage error:", error)
        throw error
      }
      return data as ChatMessage
    } catch (err: any) {
      if (isAbortError(err)) throw err
      throw err
    }
  }

  async deleteMessage(messageId: string) {
    try {
      const result = await this.executeWithAbort(
        (signal) => this.supabase
          .from("chat_messages")
          .delete()
          .eq("id", messageId)
          .abortSignal(signal)
      )
      
      const { error } = result as any

      if (error) {
        console.error("deleteMessage error:", error)
        throw error
      }
    } catch (err: any) {
      if (isAbortError(err)) throw err
      throw err
    }
  }

  // ============ Favorites ============
  async addToFavorites(messageId: string) {
    const user = await this.getCachedUser()
    
    // Check if messageId is a local ID (not a valid UUID)
    // Local IDs are generated as `assistant-${Date.now()}` or `user-${Date.now()}`
    let remoteMessageId = messageId
    
    if (!isValidUUID(messageId)) {
      console.log("Local message ID detected, looking up remoteId:", messageId)
      
      // Dynamically import to avoid circular dependencies
      const { localChatStorage } = await import('@/lib/services/local-chat-storage')
      const localMessage = localChatStorage.getMessage(messageId)
      
      if (!localMessage) {
        console.error("Message not found in local storage:", messageId)
        throw new Error("Message not found. Please try again later.")
      }
      
      if (!localMessage.remoteId) {
        console.log("Message not yet synced to server, triggering sync...")
        
        // Trigger sync and wait a bit for it to complete
        await localChatStorage.syncNow()
        
        // Re-fetch the message to check if it's synced now
        const updatedMessage = localChatStorage.getMessage(messageId)
        
        if (!updatedMessage?.remoteId) {
          console.error("Message has not been synced to server yet:", messageId)
          throw new Error("Message is still syncing. Please try again in a moment.")
        }
        
        remoteMessageId = updatedMessage.remoteId
      } else {
        remoteMessageId = localMessage.remoteId
      }
      
      console.log("Resolved local ID to remote ID:", { localId: messageId, remoteId: remoteMessageId })
    }
    
    console.log("Adding to favorites:", { messageId: remoteMessageId, userId: user.id })
    
    try {
      const result = await this.executeWithAbort(
        (signal) => this.supabase
          .from("favorites")
          .insert({ 
            message_id: remoteMessageId,
            user_id: user.id 
          } as any)
          .select()
          .abortSignal(signal)
          .single()
      )
      
      const { data, error } = result as any

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
      
      // Mark message as favorite (use both local and remote IDs)
      await this.updateMessage(remoteMessageId, { is_favorite: true })
      
      // Also update the local message if it was a local ID
      if (messageId !== remoteMessageId) {
        const { localChatStorage } = await import('@/lib/services/local-chat-storage')
        localChatStorage.updateMessage(messageId, { isFavorite: true })
      }

      return data as Favorite
    } catch (err: any) {
      if (isAbortError(err)) throw err
      throw err
    }
  }

  async removeFromFavorites(messageId: string) {
    // Check if messageId is a local ID (not a valid UUID)
    let remoteMessageId = messageId
    
    if (!isValidUUID(messageId)) {
      console.log("Local message ID detected for unfavorite, looking up remoteId:", messageId)
      
      const { localChatStorage } = await import('@/lib/services/local-chat-storage')
      const localMessage = localChatStorage.getMessage(messageId)
      
      if (localMessage?.remoteId) {
        remoteMessageId = localMessage.remoteId
        console.log("Resolved local ID to remote ID:", { localId: messageId, remoteId: remoteMessageId })
      } else {
        // If no remoteId, the message might not be synced or doesn't exist in favorites
        console.log("No remoteId found, message might not be favorited remotely:", messageId)
        
        // Update local storage anyway
        if (localMessage) {
          localChatStorage.updateMessage(messageId, { isFavorite: false })
        }
        return // Nothing to remove from server
      }
    }
    
    try {
      const result = await this.executeWithAbort(
        (signal) => this.supabase
          .from("favorites")
          .delete()
          .eq("message_id", remoteMessageId)
          .abortSignal(signal)
      )
      
      const { error } = result as any

      if (error) {
        console.error("removeFromFavorites error:", error)
        throw error
      }

      // Unmark message as favorite
      await this.updateMessage(remoteMessageId, { is_favorite: false })
      
      // Also update the local message if it was a local ID
      if (messageId !== remoteMessageId) {
        const { localChatStorage } = await import('@/lib/services/local-chat-storage')
        localChatStorage.updateMessage(messageId, { isFavorite: false })
      }
    } catch (err: any) {
      if (isAbortError(err)) throw err
      throw err
    }
  }

  async getFavorites() {
    const gen = this.generation
    const user = await this.getCachedUser()

    try {
      const result = await this.executeWithAbort(
        (signal) => this.supabase
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
          .abortSignal(signal)
      )
      
      const { data, error } = result as any

      // Stale means ignore result, always
      if (this.isStale(gen)) {
        throw new DOMException("Request aborted", "AbortError")
      }

      if (error) {
        console.error("getFavorites error:", error)
        throw error
      }
      return data || []
    } catch (err: any) {
      if (isAbortError(err)) throw err
      throw err
    }
  }

  // ============ Bulk Operations ============
  async saveChatHistory(chatId: string, messages: Array<{ id?: string; role: "user" | "assistant" | "system"; content: string; metadata?: Record<string, any> }>) {
    try {
      // Delete existing messages for this chat
      const deleteResult = await this.executeWithAbort(
        (signal) => this.supabase
          .from("chat_messages")
          .delete()
          .eq("chat_id", chatId)
          .abortSignal(signal)
      )
      
      const { error: deleteError } = deleteResult as any

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

      const insertResult = await this.executeWithAbort(
        (signal) => this.supabase
          .from("chat_messages")
          .insert(messagesToInsert as any)
          .abortSignal(signal)
      )
      
      const { error } = insertResult as any

      if (error) {
        console.error("saveChatHistory insert error:", error)
        throw error
      }

      // Update last_message_at
      const updateResult = await this.executeWithAbort(
        (signal) => this.supabase
          .from("chats")
          // @ts-expect-error - Supabase types not generated yet
          .update({ last_message_at: new Date().toISOString() } as any)
          .eq("id", chatId)
          .abortSignal(signal)
      )
      
      const { error: updateError } = updateResult as any

      if (updateError) {
        console.error("saveChatHistory update error:", updateError)
      }
    } catch (err: any) {
      if (isAbortError(err)) throw err
      throw err
    }
  }
}

// Export singleton instance
export const chatService = new ChatService()
