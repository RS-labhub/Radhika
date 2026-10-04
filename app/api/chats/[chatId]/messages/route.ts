import { NextRequest } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthenticatedUser, errorResponse, successResponse } from "@/lib/api-utils"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function userOwnsChat(supabase: ReturnType<typeof createServiceRoleClient>, chatId: string, userId: string) {
  if (!UUID_RE.test(chatId)) return false
  const { data, error } = await supabase
    .from("chats")
    .select("id")
    .eq("id", chatId)
    .eq("user_id", userId)
    .maybeSingle()
  return !error && !!data
}

// GET /api/chats/[chatId]/messages - Get all messages for a chat
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
    const { chatId } = await params

    const user = await getAuthenticatedUser()
    if (!user) {
      return errorResponse("Unauthorized", 401)
    }

    const searchParams = request.nextUrl.searchParams
    const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10) || 100, 1000)
    const direction = searchParams.get("direction") || "asc"
    const cursor = searchParams.get("cursor")

    const supabase = createServiceRoleClient()

    if (!(await userOwnsChat(supabase, chatId, user.id))) {
      return errorResponse("Chat not found", 404)
    }

    const ascending = direction === "asc"
    let query = supabase
      .from("chat_messages")
      .select("id, chat_id, role, content, metadata, is_favorite, created_at")
      .eq("chat_id", chatId)
      .order("seq_num", { ascending })
      .limit(limit)

    if (cursor) {
      if (!UUID_RE.test(cursor)) {
        return errorResponse("Invalid cursor", 400)
      }

      const { data: cursorRow, error: cursorError } = await supabase
        .from("chat_messages")
        .select("seq_num")
        .eq("id", cursor)
        .eq("chat_id", chatId)
        .maybeSingle()

      if (cursorError || !cursorRow) {
        return errorResponse("Invalid cursor", 400)
      }

      query = ascending ? query.gt("seq_num", cursorRow.seq_num) : query.lt("seq_num", cursorRow.seq_num)
    }

    const { data, error } = await query
    if (error) throw error

    const messages = (data || []).map((msg: any) => ({
      ...msg,
      is_favorite: msg.is_favorite || false,
    }))

    return successResponse({ messages })
  } catch (error) {
    console.error("Error fetching messages:", error)
    return errorResponse("Failed to fetch messages", 500, error)
  }
}

// POST /api/chats/[chatId]/messages - Add a message to a chat
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
    const { chatId } = await params

    const user = await getAuthenticatedUser()
    if (!user) {
      return errorResponse("Unauthorized", 401)
    }

    const body = await request.json()
    const { role, content, metadata } = body

    if (!role || !content) {
      return errorResponse("Role and content are required", 400)
    }

    if (!["user", "assistant", "system"].includes(role)) {
      return errorResponse("Invalid role", 400)
    }

    const supabase = createServiceRoleClient()

    if (!(await userOwnsChat(supabase, chatId, user.id))) {
      return errorResponse("Chat not found", 404)
    }

    // Chat message_count, last_message_at and last_message_preview are maintained by a DB trigger
    const { data: message, error } = await supabase
      .from("chat_messages")
      .insert({
        chat_id: chatId,
        role,
        content,
        metadata: metadata ?? {},
      })
      .select()
      .single()

    if (error) throw error

    return successResponse({ message }, 201)
  } catch (error) {
    console.error("Error adding message:", error)
    return errorResponse("Failed to add message", 500, error)
  }
}

// PATCH /api/chats/[chatId]/messages - Update message (toggle favorite)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
    const { chatId } = await params

    const user = await getAuthenticatedUser()
    if (!user) {
      return errorResponse("Unauthorized", 401)
    }

    const body = await request.json()
    const { messageId, is_favorite } = body

    if (!messageId || typeof is_favorite !== "boolean") {
      return errorResponse("Message ID and is_favorite are required", 400)
    }

    const supabase = createServiceRoleClient()

    if (
      typeof messageId !== "string" ||
      !UUID_RE.test(messageId) ||
      !(await userOwnsChat(supabase, chatId, user.id))
    ) {
      return errorResponse("Message not found", 404)
    }

    const { data: updatedMessage, error } = await supabase
      .from("chat_messages")
      .update({ is_favorite })
      .eq("id", messageId)
      .eq("chat_id", chatId)
      .select()
      .maybeSingle()

    if (error) throw error
    if (!updatedMessage) {
      return errorResponse("Message not found", 404)
    }

    return successResponse({ message: updatedMessage })
  } catch (error) {
    console.error("Error updating message:", error)
    return errorResponse("Failed to update message", 500, error)
  }
}
