import { NextRequest } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { errorResponse, successResponse } from "@/lib/api-utils"

// GET /api/share/[token] - Get a shared chat by token (public access)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params

    if (!token) {
      return errorResponse("Token is required", 400)
    }

    const supabase = createServiceRoleClient()

    const { data: chat, error: chatError } = await supabase
      .from("chats")
      .select("id, title, mode, created_at, updated_at, share_token, is_public")
      .eq("share_token", token)
      .eq("is_public", true)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle()

    if (chatError) throw chatError
    if (!chat) {
      return errorResponse("Chat not found or not shared", 404)
    }

    const { data: messages, error: messagesError } = await supabase
      .from("chat_messages")
      .select("id, role, content, created_at, metadata")
      .eq("chat_id", chat.id)
      .order("created_at", { ascending: true })
      .order("seq_num", { ascending: true })
      .limit(1000)

    if (messagesError) throw messagesError

    return successResponse({ chat, messages: messages || [] })
  } catch (error: any) {
    console.error("Error fetching shared chat:", error)
    return errorResponse(
      error.message || "Failed to fetch shared chat",
      500,
      error
    )
  }
}
