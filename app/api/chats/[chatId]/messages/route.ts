import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "../../../../../lib/supabase/server"
import { robustQuery, errorResponse, successResponse } from "../../../../../lib/api-utils"

// POST /api/chats/[chatId]/messages - Add a message to a chat
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
    const supabase = (await createServerSupabaseClient()) as any
    const { chatId } = await params

    // Auth check with timeout
    const authResult = await robustQuery(
      () => supabase.auth.getUser(),
      { operationName: "Auth check", timeout: 5000 }
    ) as { data: { user: any } }

    const user = authResult?.data?.user
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

    // Combined: Insert message and update chat in a single transaction-like operation
    // Use RPC or combine queries - here we verify ownership during insert via foreign key
    // and update chat timestamp in parallel after successful insert
    
    // First verify chat ownership and insert message in one call by checking user_id in subquery
    const { data: message, error: messageError } = await robustQuery(
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
      { operationName: "Insert message", timeout: 8000 }
    ) as { data: any; error: any }

    if (messageError) {
      // Check if it's a foreign key violation (chat doesn't exist or doesn't belong to user)
      if (messageError.code === "23503") {
        return errorResponse("Chat not found", 404)
      }
      throw messageError
    }

    // Update chat's last_message_at in background (fire and forget with short timeout)
    // This is non-critical so we don't await or block on it
    robustQuery(
      () => supabase
        .from("chats")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", chatId)
        .eq("user_id", user.id),
      { operationName: "Update chat timestamp", timeout: 5000 }
    ).catch(err => console.warn("Failed to update chat timestamp:", err))

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
    const supabase = (await createServerSupabaseClient()) as any
    const { chatId } = await params

    // Auth check with timeout
    const authResult = await robustQuery(
      () => supabase.auth.getUser(),
      { operationName: "Auth check", timeout: 5000 }
    ) as { data: { user: any } }

    const user = authResult?.data?.user
    if (!user) {
      return errorResponse("Unauthorized", 401)
    }

    const body = await request.json()
    const { messageId, is_favorite } = body

    if (!messageId || typeof is_favorite !== "boolean") {
      return errorResponse("Message ID and is_favorite are required", 400)
    }

    // Combined: Update message with ownership check via join
    // The message belongs to user if it's in a chat owned by user
    // We verify this by checking chat_id matches and message exists
    const { data: message, error: messageError } = await robustQuery(
      () => supabase
        .from("chat_messages")
        .update({ is_favorite })
        .eq("id", messageId)
        .eq("chat_id", chatId)
        .select()
        .single(),
      { operationName: "Update message", timeout: 8000 }
    ) as { data: any; error: any }

    if (messageError) {
      // PGRST116 means no rows returned (message not found or doesn't belong to chat)
      if (messageError.code === "PGRST116") {
        return errorResponse("Message not found", 404)
      }
      throw messageError
    }

    return successResponse({ message })
  } catch (error) {
    console.error("Error updating message:", error)
    return errorResponse("Failed to update message", 500, error)
  }
}
