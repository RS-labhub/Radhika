import { getSupabaseClient } from "../supabase/client"
import type { Chat, ChatMessage } from "../../types/chat"

export async function getChats(userId: string, options?: {
  mode?: string
  profileId?: string
  includeArchived?: boolean
  limit?: number
}): Promise<Chat[]> {
  let query = getSupabaseClient()
    .from("chats")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("last_message_at", { ascending: false, nullsFirst: false })

  if (options?.mode) query = query.eq("mode", options.mode)
  if (options?.profileId) query = query.eq("profile_id", options.profileId)
  if (!options?.includeArchived) query = query.eq("is_archived", false)
  if (options?.limit) query = query.limit(options.limit)

  const { data, error } = await query
  if (error) throw error
  return (data || []) as Chat[]
}

export async function getRecentChats(userId: string, limit = 10): Promise<Chat[]> {
  return getChats(userId, { limit, includeArchived: false })
}

export async function getChat(chatId: string): Promise<Chat | null> {
  const { data, error } = await getSupabaseClient()
    .from("chats")
    .select("*")
    .eq("id", chatId)
    .maybeSingle()

  if (error) {
    if (error.code === "22P02") return null
    throw error
  }
  return (data as Chat | null) ?? null
}

export async function createChat(
  userId: string,
  mode: string,
  title: string,
  profileId?: string
): Promise<Chat> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from("chats")
    .insert({
      user_id: userId,
      mode,
      title,
      profile_id: profileId || null,
      last_message_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) throw error

  await incrementUserStats(userId, mode, 1, 0)
  return data as Chat
}

export async function updateChat(
  chatId: string,
  updates: Partial<Pick<Chat, "title" | "is_archived" | "profile_id">>
): Promise<Chat> {
  const updateData: Record<string, unknown> = {}
  if (updates.title !== undefined) updateData.title = updates.title
  if (updates.is_archived !== undefined) updateData.is_archived = updates.is_archived
  if (updates.profile_id !== undefined) updateData.profile_id = updates.profile_id

  const { data, error } = await getSupabaseClient()
    .from("chats")
    .update(updateData)
    .eq("id", chatId)
    .select()
    .single()

  if (error) throw error
  return data as Chat
}

export async function archiveChat(chatId: string): Promise<Chat> {
  return updateChat(chatId, { is_archived: true })
}

export async function unarchiveChat(chatId: string): Promise<Chat> {
  return updateChat(chatId, { is_archived: false })
}

export async function deleteChat(chatId: string): Promise<void> {
  const { error } = await getSupabaseClient().from("chats").delete().eq("id", chatId)
  if (error) throw error
}

export async function getChatMessages(chatId: string): Promise<ChatMessage[]> {
  const { data, error } = await getSupabaseClient()
    .from("chat_messages")
    .select("*")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true })
    .order("seq_num", { ascending: true })
    .limit(1000)

  if (error) throw error
  return (data || []) as ChatMessage[]
}

export async function addMessage(
  chatId: string,
  role: "user" | "assistant" | "system",
  content: string,
  metadata?: Record<string, unknown>
): Promise<ChatMessage> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from("chat_messages")
    .insert({ chat_id: chatId, role, content, metadata: metadata ?? {} })
    .select()
    .single()

  if (error) throw error

  const { data: { session } } = await supabase.auth.getSession()
  if (session?.user) await incrementUserStats(session.user.id, null, 0, 1)

  return data as ChatMessage
}

export async function toggleMessageFavorite(messageId: string, isFavorite: boolean): Promise<void> {
  const { error } = await getSupabaseClient()
    .from("chat_messages")
    .update({ is_favorite: isFavorite })
    .eq("id", messageId)

  if (error) throw error
}

export async function getFavoriteMessages(userId: string): Promise<ChatMessage[]> {
  const { data, error } = await getSupabaseClient()
    .from("chat_messages")
    .select("*, chats!inner(user_id)")
    .eq("is_favorite", true)
    .eq("chats.user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100)

  if (error) throw error
  return (data || []).map(({ chats: _chats, ...message }) => message) as ChatMessage[]
}

export function generateChatTitle(firstMessage: string): string {
  const maxLength = 50
  const cleaned = firstMessage.trim().replace(/\n/g, " ")
  if (cleaned.length <= maxLength) return cleaned
  return cleaned.substring(0, maxLength - 3) + "..."
}

async function incrementUserStats(
  userId: string,
  mode: string | null,
  chatsInc: number,
  messagesInc: number
): Promise<void> {
  const { error } = await getSupabaseClient().rpc("increment_user_stats", {
    p_user_id: userId,
    p_mode: mode,
    p_chats_inc: chatsInc,
    p_messages_inc: messagesInc,
  })
  if (error) console.warn("Failed to update user stats:", error.message)
}

export async function getChatStats(userId: string): Promise<{
  totalChats: number
  totalMessages: number
  chatsByMode: Record<string, number>
}> {
  const supabase = getSupabaseClient()

  const { data: stats, error } = await supabase
    .from("user_stats")
    .select("total_chats, total_messages, chats_by_mode")
    .eq("user_id", userId)
    .maybeSingle()

  if (!error && stats) {
    return {
      totalChats: Number(stats.total_chats || 0),
      totalMessages: Number(stats.total_messages || 0),
      chatsByMode: (stats.chats_by_mode || {}) as Record<string, number>,
    }
  }

  if (error) console.warn("Could not read user_stats, falling back to live counts:", error.message)

  const { data: chats, error: chatsError } = await supabase
    .from("chats")
    .select("mode, message_count")
    .eq("user_id", userId)

  if (chatsError) throw chatsError

  const chatsByMode: Record<string, number> = {}
  let totalMessages = 0
  for (const chat of chats || []) {
    chatsByMode[chat.mode] = (chatsByMode[chat.mode] || 0) + 1
    totalMessages += chat.message_count || 0
  }

  return {
    totalChats: chats?.length || 0,
    totalMessages,
    chatsByMode,
  }
}
