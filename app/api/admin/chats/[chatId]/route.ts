import { NextRequest } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, getAuthenticatedUser, isReservedEmail } from "@/lib/api-utils"

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function verifyAdminAccess() {
  const user = await getAuthenticatedUser()
  if (!user) return { user: null, isAdmin: false }
  return { user, isAdmin: await isReservedEmail(user.email) }
}

// GET /api/admin/chats/[chatId] - Get chat with all messages
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
    const { user, isAdmin } = await verifyAdminAccess()

    if (!user) {
      return errorResponse("Unauthorized", 401)
    }

    if (!isAdmin) {
      return errorResponse("Forbidden - Admin access required", 403)
    }

    const { chatId } = await params
    if (!UUID_REGEX.test(chatId)) {
      return errorResponse("Failed to fetch chat details", 500)
    }
    const supabase = createServiceRoleClient()

    const { data: chat, error: chatError } = await supabase
      .from("chats")
      .select("id, user_id, mode, title, message_count, created_at, last_message_at, is_archived")
      .eq("id", chatId)
      .single()
    if (chatError || !chat) throw chatError || new Error("Chat not found")

    const { data: messages, count, error: messagesError } = await supabase
      .from("chat_messages")
      .select("id, role, content, metadata, created_at, is_favorite", { count: "exact" })
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true })
      .order("seq_num", { ascending: true })
      .limit(1000)
    if (messagesError) throw messagesError

    return successResponse({
      chat: {
        id: chat.id,
        userId: chat.user_id,
        mode: chat.mode,
        title: chat.title,
        messageCount: chat.message_count || 0,
        createdAt: chat.created_at,
        lastMessageAt: chat.last_message_at,
        isArchived: chat.is_archived || false
      },
      messages: (messages || []).map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        metadata: msg.metadata ?? null,
        createdAt: msg.created_at,
        isFavorite: msg.is_favorite || false
      })),
      totalMessages: count ?? 0
    })
  } catch (error: any) {
    console.error("Error fetching chat details:", error)
    return errorResponse("Failed to fetch chat details", 500)
  }
}

// DELETE /api/admin/chats/[chatId] - Delete a chat and all its messages
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
    const { user, isAdmin } = await verifyAdminAccess()

    if (!user) {
      return errorResponse("Unauthorized", 401)
    }

    if (!isAdmin) {
      return errorResponse("Forbidden - Admin access required", 403)
    }

    const { chatId } = await params
    if (!UUID_REGEX.test(chatId)) {
      return errorResponse("Failed to delete chat", 500)
    }
    const supabase = createServiceRoleClient()

    // Messages cascade from the chat row
    const { error } = await supabase.from("chats").delete().eq("id", chatId)
    if (error) throw error

    return successResponse({ message: "Chat deleted successfully" })
  } catch (error: any) {
    console.error("Error deleting chat:", error)
    return errorResponse("Failed to delete chat", 500)
  }
}
