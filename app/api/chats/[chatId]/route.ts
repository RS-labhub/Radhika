import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "../../../../lib/supabase/server"
import { robustQuery, errorResponse, successResponse } from "../../../../lib/api-utils"

// GET /api/chats/[chatId] - Get a specific chat with messages
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
    const supabase = (await createServerSupabaseClient()) as any
    const { chatId } = await params

    // Combined auth check
    const authResult = await robustQuery(
      () => supabase.auth.getUser(),
      { operationName: "Auth check", timeout: 5000 }
    ) as { data: { user: any } }

    const user = authResult?.data?.user
    if (!user) {
      return errorResponse("Unauthorized", 401)
    }

    // Fetch chat and messages in parallel to reduce total time
    const [chatResult, messagesResult] = await Promise.all([
      robustQuery(
        () => supabase
          .from("chats")
          .select("*")
          .eq("id", chatId)
          .eq("user_id", user.id)
          .single(),
        { operationName: "Fetch chat", timeout: 8000 }
      ) as Promise<{ data: any; error: any }>,
      robustQuery(
        () => supabase
          .from("chat_messages")
          .select("*")
          .eq("chat_id", chatId)
          .order("created_at", { ascending: true }),
        { operationName: "Fetch messages", timeout: 8000 }
      ) as Promise<{ data: any[]; error: any }>
    ])

    if (chatResult.error || !chatResult.data) {
      return errorResponse("Chat not found", 404)
    }

    if (messagesResult.error) {
      throw messagesResult.error
    }

    return successResponse({ chat: chatResult.data, messages: messagesResult.data || [] })
  } catch (error) {
    console.error("Error fetching chat:", error)
    return errorResponse("Failed to fetch chat", 500, error)
  }
}

// PATCH /api/chats/[chatId] - Update a chat
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

    updates.updated_at = new Date().toISOString()

    // Single update query with robust handling
    const { data, error } = await robustQuery(
      () => supabase
        .from("chats")
        .update(updates)
        .eq("id", chatId)
        .eq("user_id", user.id)
        .select()
        .single(),
      { operationName: "Update chat", timeout: 8000 }
    ) as { data: any; error: any }

    if (error) {
      throw error
    }

    return successResponse({ chat: data })
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

    // Single delete query with robust handling
    const { error } = await robustQuery(
      () => supabase
        .from("chats")
        .delete()
        .eq("id", chatId)
        .eq("user_id", user.id),
      { operationName: "Delete chat", timeout: 8000 }
    ) as { error: any }

    if (error) {
      throw error
    }

    return successResponse({ success: true })
  } catch (error) {
    console.error("Error deleting chat:", error)
    return errorResponse("Failed to delete chat", 500, error)
  }
}
