import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "../../../../../lib/supabase/server"

// POST /api/chats/[chatId]/messages - Add a message to a chat
export async function POST(
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

    // Verify chat belongs to user
    const { data: chat, error: chatError } = await supabase
      .from("chats")
      .select("id")
      .eq("id", chatId)
      .eq("user_id", user.id)
      .single()

    if (chatError || !chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 })
    }

    const body = await request.json()
    const { role, content, metadata } = body

    if (!role || !content) {
      return NextResponse.json(
        { error: "Role and content are required" },
        { status: 400 }
      )
    }

    if (!["user", "assistant", "system"].includes(role)) {
      return NextResponse.json(
        { error: "Invalid role" },
        { status: 400 }
      )
    }

    // Insert the message
    const { data: message, error: messageError } = await supabase
      .from("chat_messages")
      .insert({
        chat_id: chatId,
        role,
        content,
        metadata: metadata || null,
      })
      .select()
      .single()

    if (messageError) {
      throw messageError
    }

    // Update chat's last_message_at
    await supabase
      .from("chats")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", chatId)

    return NextResponse.json({ message }, { status: 201 })
  } catch (error) {
    console.error("Error adding message:", error)
    return NextResponse.json(
      { error: "Failed to add message" },
      { status: 500 }
    )
  }
}

// PATCH /api/chats/[chatId]/messages - Update message (toggle favorite)
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
    const { messageId, is_favorite } = body

    if (!messageId || typeof is_favorite !== "boolean") {
      return NextResponse.json(
        { error: "Message ID and is_favorite are required" },
        { status: 400 }
      )
    }

    // Verify chat belongs to user
    const { data: chat, error: chatError } = await supabase
      .from("chats")
      .select("id")
      .eq("id", chatId)
      .eq("user_id", user.id)
      .single()

    if (chatError || !chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 })
    }

    const { data: message, error: messageError } = await supabase
      .from("chat_messages")
      .update({ is_favorite })
      .eq("id", messageId)
      .eq("chat_id", chatId)
      .select()
      .single()

    if (messageError) {
      throw messageError
    }

    return NextResponse.json({ message })
  } catch (error) {
    console.error("Error updating message:", error)
    return NextResponse.json(
      { error: "Failed to update message" },
      { status: 500 }
    )
  }
}
