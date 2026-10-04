import { NextRequest } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthenticatedUser, errorResponse, successResponse } from "@/lib/api-utils"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /api/chats/[chatId] - Get a specific chat with messages
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

    if (!UUID_RE.test(chatId)) {
      return errorResponse("Chat not found", 404)
    }

    const supabase = createServiceRoleClient()

    const { data: chat, error: chatError } = await supabase
      .from("chats")
      .select("*")
      .eq("id", chatId)
      .eq("user_id", user.id)
      .maybeSingle()

    if (chatError || !chat) {
      return errorResponse("Chat not found", 404)
    }

    let messages: any[] = []
    const { data, error: messagesError } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true })
      .order("seq_num", { ascending: true })
      .limit(1000)

    if (messagesError) {
      console.error("Error fetching messages:", messagesError)
    } else {
      messages = data || []
    }

    return successResponse({ chat, messages })
  } catch (error) {
    console.error("Error fetching chat:", error)
    return errorResponse("Failed to fetch chat", 500, error)
  }
}

// PATCH /api/chats/[chatId] - Update a chat (including sharing)
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

    if (!UUID_RE.test(chatId)) {
      return errorResponse("Chat not found", 404)
    }

    const supabase = createServiceRoleClient()

    if (body.action === "share") {
      const { data: chat, error } = await supabase
        .from("chats")
        .select("id, share_token, is_public")
        .eq("id", chatId)
        .eq("user_id", user.id)
        .maybeSingle()

      if (error || !chat) {
        return errorResponse("Chat not found", 404)
      }

      if (chat.share_token && chat.is_public) {
        return successResponse({ share_token: chat.share_token })
      }

      const shareToken = crypto.randomUUID().replace(/-/g, "").slice(0, 16)

      const { error: updateError } = await supabase
        .from("chats")
        .update({
          share_token: shareToken,
          is_public: true,
          shared_at: new Date().toISOString(),
        })
        .eq("id", chatId)
        .eq("user_id", user.id)

      if (updateError) throw updateError

      return successResponse({ share_token: shareToken })
    }

    if (body.action === "unshare") {
      const { data: chat, error } = await supabase
        .from("chats")
        .select("id")
        .eq("id", chatId)
        .eq("user_id", user.id)
        .maybeSingle()

      if (error || !chat) {
        return errorResponse("Chat not found", 404)
      }

      const { error: updateError } = await supabase
        .from("chats")
        .update({ share_token: null, is_public: false, shared_at: null })
        .eq("id", chatId)
        .eq("user_id", user.id)

      if (updateError) throw updateError

      return successResponse({ success: true })
    }

    const allowedFields = ["title", "is_archived", "profile_id"]
    const updates: Record<string, unknown> = {}

    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field]
      }
    }

    if (Object.keys(updates).length === 0) {
      return errorResponse("No valid fields to update", 400)
    }

    if (updates.profile_id && (typeof updates.profile_id !== "string" || !UUID_RE.test(updates.profile_id))) {
      return errorResponse("Invalid profile_id", 400)
    }

    const { data: updatedChat, error } = await supabase
      .from("chats")
      .update(updates)
      .eq("id", chatId)
      .eq("user_id", user.id)
      .select()
      .maybeSingle()

    if (error) throw error
    if (!updatedChat) {
      return errorResponse("Chat not found", 404)
    }

    return successResponse({ chat: updatedChat })
  } catch (error) {
    console.error("Error updating chat:", error)
    return errorResponse("Failed to update chat", 500, error)
  }
}

// DELETE /api/chats/[chatId] - Delete a chat
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
    const { chatId } = await params

    const user = await getAuthenticatedUser()
    if (!user) {
      return errorResponse("Unauthorized", 401)
    }

    if (!UUID_RE.test(chatId)) {
      return errorResponse("Chat not found", 404)
    }

    const supabase = createServiceRoleClient()

    const { data: chatToDelete, error: fetchError } = await supabase
      .from("chats")
      .select("id, mode, message_count")
      .eq("id", chatId)
      .eq("user_id", user.id)
      .maybeSingle()

    if (fetchError || !chatToDelete) {
      return errorResponse("Chat not found", 404)
    }

    // Messages and favorites are removed by ON DELETE CASCADE
    const { error: deleteError } = await supabase
      .from("chats")
      .delete()
      .eq("id", chatId)
      .eq("user_id", user.id)

    if (deleteError) throw deleteError

    const { error: statsError } = await supabase.rpc("increment_user_stats", {
      p_user_id: user.id,
      p_mode: chatToDelete.mode || "general",
      p_chats_inc: -1,
      p_messages_inc: -(chatToDelete.message_count || 0),
    })

    if (statsError) {
      console.warn(`Failed to update user stats after deleting chat ${chatId}:`, statsError.message)
    }

    return successResponse({ success: true })
  } catch (error) {
    console.error("Error deleting chat:", error)
    return errorResponse("Failed to delete chat", 500, error)
  }
}
