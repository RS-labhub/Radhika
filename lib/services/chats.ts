import { getSupabaseClient } from "../supabase/client"
import { retryWithReset } from "../supabase/safe"
import type { Chat, ChatInsert, ChatMessage, ChatMessageInsert } from "../../types/database"

export async function getChats(userId: string, options?: {
  mode?: string
  profileId?: string
  includeArchived?: boolean
  limit?: number
}): Promise<Chat[]> {
  const supabase = getSupabaseClient() as any
  const buildQuery = () => {
    let query = supabase
      .from("chats")
      .select("id,title,mode,profile_id,last_message_at,created_at,is_archived,deleted_at")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("last_message_at", { ascending: false, nullsFirst: false })

    if (options?.mode) {
      query = query.eq("mode", options.mode)
    }

    if (options?.profileId) {
      query = query.eq("profile_id", options.profileId)
    }

    if (!options?.includeArchived) {
      query = query.eq("is_archived", false)
    }

    if (options?.limit) {
      query = query.limit(options.limit)
    } else {
      // Default limit to 50 most recent chats for performance
      query = query.limit(30)
    }

    return query
  }

  const { data, error } = await retryWithReset(buildQuery, 20000) as any

  if (error) throw error
  return data || []
}

export async function getRecentChats(userId: string, limit = 10): Promise<Chat[]> {
  return getChats(userId, { limit, includeArchived: false })
}

export async function getChat(chatId: string): Promise<Chat | null> {
  const supabase = getSupabaseClient() as any
  const { data, error } = await retryWithReset(
    () => supabase
      .from("chats")
      .select("id,title,mode,profile_id,last_message_at,created_at,is_archived,deleted_at")
      .eq("id", chatId)
      .single(),
    10000
  ) as any

  if (error && error.code !== "PGRST116") throw error
  return data
}

export async function createChat(
  userId: string,
  mode: string,
  title: string,
  profileId?: string
): Promise<Chat> {
  const supabase = getSupabaseClient() as any
  const { data, error } = await retryWithReset(
    () => supabase
      .from("chats")
      .insert({
        user_id: userId,
        mode,
        title,
        profile_id: profileId || null,
        last_message_at: new Date().toISOString(),
      })
      .select("id,title,mode,profile_id,last_message_at,created_at,is_archived,deleted_at")
      .single(),
    20000
  ) as any

  if (error) throw error
  // Increment the persisted counter so deleting chats doesn't remove this count
  try {
    await supabase.rpc("increment_user_stats", {
      p_user_id: userId,
      p_mode: mode,
      p_chats_inc: 1,
      p_messages_inc: 0,
    })
  } catch (e) {
    // Non-fatal: log but don't block chat creation
    console.warn("Failed to increment user_stats after creating chat:", e)
  }
  return data
}

export async function updateChat(
  chatId: string,
  updates: Partial<Pick<Chat, "title" | "is_archived" | "profile_id">>
): Promise<Chat> {
  const supabase = getSupabaseClient() as any
  const { data, error } = await retryWithReset(
    () => supabase
      .from("chats")
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq("id", chatId)
      .select()
      .single(),
    10000
  ) as any

  if (error) throw error
  return data
}

export async function archiveChat(chatId: string): Promise<Chat> {
  return updateChat(chatId, { is_archived: true })
}

export async function unarchiveChat(chatId: string): Promise<Chat> {
  return updateChat(chatId, { is_archived: false })
}

export async function deleteChat(chatId: string): Promise<void> {
  const supabase = getSupabaseClient() as any
  const { error } = await retryWithReset(
    () => supabase
      .from("chats")
      .delete()
      .eq("id", chatId),
    10000
  ) as any

  if (error) throw error
}

// Chat Messages

export async function getChatMessages(chatId: string): Promise<ChatMessage[]> {
  const supabase = getSupabaseClient() as any
  const { data, error } = await retryWithReset(
    () => supabase
      .from("chat_messages")
      .select("id,title,mode,profile_id,last_message_at,created_at,is_archived,deleted_at")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true }),
    10000
  ) as any

  if (error) throw error
  return data || []
}

export async function addMessage(
  chatId: string,
  role: "user" | "assistant" | "system",
  content: string,
  metadata?: Record<string, unknown>
): Promise<ChatMessage> {
  const supabase = getSupabaseClient() as any
  
  // Add the message
  const { data: message, error: messageError } = await retryWithReset(
    () => supabase
      .from("chat_messages")
      .insert({
        chat_id: chatId,
        role,
        content,
        metadata: metadata || null,
      })
      .select()
      .single(),
    10000
  ) as any

  if (messageError) throw messageError

  // Update the chat's last_message_at
  await retryWithReset(
    () => supabase
      .from("chats")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", chatId),
    10000
  ) as any
  
  // Increment the persisted message counter for the owner of this chat (best-effort)
  try {
    // Get chat owner and mode
    const { data: chatRow } = await retryWithReset(
      () => supabase.from("chats").select("user_id").eq("id", chatId).single(),
      10000
    ) as any
    const ownerId = chatRow?.user_id
    if (ownerId) {
      await supabase.rpc("increment_user_stats", {
        p_user_id: ownerId,
        p_mode: null,
        p_chats_inc: 0,
        p_messages_inc: 1,
      })
    }
  } catch (e) {
    console.warn("Failed to increment user_stats after adding message:", e)
  }
  return message
}

export async function toggleMessageFavorite(messageId: string, isFavorite: boolean): Promise<void> {
  const supabase = getSupabaseClient() as any
  const { error } = await retryWithReset(
    () => supabase
      .from("chat_messages")
      .update({ is_favorite: isFavorite })
      .eq("id", messageId),
    10000
  ) as any

  if (error) throw error
}

export async function getFavoriteMessages(userId: string): Promise<ChatMessage[]> {
  const supabase = getSupabaseClient() as any
  const { data, error } = await retryWithReset(
    () => supabase
      .from("chat_messages")
      .select(`
        *,
        chats!inner(user_id)
      `)
      .eq("chats.user_id", userId)
      .eq("is_favorite", true)
      .order("created_at", { ascending: false }),
    10000
  ) as any

  if (error) throw error
  return data || []
}

// Generate title from first message
export function generateChatTitle(firstMessage: string): string {
  const maxLength = 50
  const cleaned = firstMessage.trim().replace(/\n/g, " ")
  if (cleaned.length <= maxLength) return cleaned
  return cleaned.substring(0, maxLength - 3) + "..."
}

// Stats helpers
export async function getChatStats(userId: string): Promise<{
  totalChats: number
  totalMessages: number
  chatsByMode: Record<string, number>
}> {
  const supabase = getSupabaseClient() as any
  // Prefer the persisted counters in user_stats. Fall back to live counts if missing.
  try {
    const { data: statsRow, error: statsError } = await retryWithReset(
      () => supabase
        .from("user_stats")
        .select("total_chats, total_messages, chats_by_mode")
        .eq("user_id", userId)
        .single(),
      10000
    ) as any

    if (!statsError && statsRow) {
      return {
        totalChats: Number(statsRow.total_chats || 0),
        totalMessages: Number(statsRow.total_messages || 0),
        chatsByMode: (statsRow.chats_by_mode as Record<string, number>) || {},
      }
    }
  } catch (e) {
    // ignore and fall back
    console.warn("Could not read persisted user_stats, falling back to live counts:", e)
  }

  // Fallback: compute from live data (keeps previous behavior)
  const { data: chatsRaw, error: chatsError } = await retryWithReset(
    () => supabase
      .from("chats")
      .select("id, mode")
      .eq("user_id", userId),
    10000
  ) as any

  const chats = (chatsRaw as Array<{ id: string; mode: string }> ) || []

  if (chatsError) throw chatsError

  const chatIds = chats.map((c) => c.id) || []
  
  let totalMessages = 0
  if (chatIds.length > 0) {
    const { count, error: messagesError } = await retryWithReset(
      () => supabase
        .from("chat_messages")
        .select("*", { count: "exact", head: true })
        .in("chat_id", chatIds),
      10000
    ) as any

    if (messagesError) throw messagesError
    totalMessages = count || 0
  }

  const chatsByMode: Record<string, number> = {}
  chats.forEach((chat) => {
    chatsByMode[chat.mode] = (chatsByMode[chat.mode] || 0) + 1
  })

  return {
    totalChats: chats?.length || 0,
    totalMessages,
    chatsByMode,
  }
}
