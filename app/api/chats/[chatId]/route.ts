import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "../../../../lib/supabase/server"

// GET /api/chats/[chatId] - Get a specific chat with messages
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
  const supabase = (await createServerSupabaseClient()) as any
    const { data: { user } } = await supabase.auth.getUser()
    const { chatId } = await params

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get the chat
    const { data: chat, error: chatError } = await supabase
      .from("chats")
      .select("*")
      .eq("id", chatId)
      .eq("user_id", user.id)
      .single()

    if (chatError || !chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 })
    }

    // Get messages
    const { data: messages, error: messagesError } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true })

    if (messagesError) {
      throw messagesError
    }

    return NextResponse.json({ chat, messages })
  } catch (error) {
    console.error("Error fetching chat:", error)
    return NextResponse.json(
      { error: "Failed to fetch chat" },
      { status: 500 }
    )
  }
}

// PATCH /api/chats/[chatId] - Update a chat
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
  const supabase = (await createServerSupabaseClient()) as any
  const { data: { user } } = await supabase.auth.getUser()
    const { chatId } = await params

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
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
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      )
    }

    updates.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from("chats")
      .update(updates)
      .eq("id", chatId)
      .eq("user_id", user.id)
      .select()
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json({ chat: data })
  } catch (error) {
    console.error("Error updating chat:", error)
    return NextResponse.json(
      { error: "Failed to update chat" },
      { status: 500 }
    )
  }
}

// DELETE /api/chats/[chatId] - Delete a chat
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
  const supabase = (await createServerSupabaseClient()) as any
  const { data: { user } } = await supabase.auth.getUser()
    const { chatId } = await params

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { error } = await supabase
      .from("chats")
      .delete()
      .eq("id", chatId)
      .eq("user_id", user.id)

    if (error) {
      throw error
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting chat:", error)
    return NextResponse.json(
      { error: "Failed to delete chat" },
      { status: 500 }
    )
  }
}
