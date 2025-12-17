import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "../../../lib/supabase/server"

// GET /api/favorites - Get all favorite messages
export async function GET(request: NextRequest) {
  try {
  const supabase = (await createServerSupabaseClient()) as any
  const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get all favorite messages with chat info
    const { data, error } = await supabase
      .from("chat_messages")
      .select(`
        *,
        chat:chats!inner(
          id,
          title,
          mode,
          user_id
        )
      `)
      .eq("is_favorite", true)
      .eq("chat.user_id", user.id)
      .order("created_at", { ascending: false })

    if (error) {
      throw error
    }

    return NextResponse.json({ favorites: data })
  } catch (error) {
    console.error("Error fetching favorites:", error)
    return NextResponse.json(
      { error: "Failed to fetch favorites" },
      { status: 500 }
    )
  }
}

// POST /api/favorites - Add a message to favorites
export async function POST(request: NextRequest) {
  try {
    const supabase = (await createServerSupabaseClient()) as any
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { messageId } = body

    if (!messageId) {
      return NextResponse.json(
        { error: "Message ID is required" },
        { status: 400 }
      )
    }

    // Verify the message belongs to a chat owned by the user
    const { data: message, error: messageError } = await supabase
      .from("chat_messages")
      .select(`
        *,
        chat:chats!inner(user_id)
      `)
      .eq("id", messageId)
      .eq("chat.user_id", user.id)
      .single()

    if (messageError || !message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 })
    }

    // Update message to be favorite
    const { data, error } = await supabase
      .from("chat_messages")
      .update({ is_favorite: true })
      .eq("id", messageId)
      .select()
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json({ favorite: data })
  } catch (error) {
    console.error("Error adding favorite:", error)
    return NextResponse.json(
      { error: "Failed to add favorite" },
      { status: 500 }
    )
  }
}

// DELETE /api/favorites - Remove a message from favorites
export async function DELETE(request: NextRequest) {
  try {
    const supabase = (await createServerSupabaseClient()) as any
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const messageId = searchParams.get("messageId")

    if (!messageId) {
      return NextResponse.json(
        { error: "Message ID is required" },
        { status: 400 }
      )
    }

    // Verify the message belongs to a chat owned by the user
    const { data: message, error: messageError } = await supabase
      .from("chat_messages")
      .select(`
        *,
        chat:chats!inner(user_id)
      `)
      .eq("id", messageId)
      .eq("chat.user_id", user.id)
      .single()

    if (messageError || !message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 })
    }

    // Update message to remove favorite
    const { error } = await supabase
      .from("chat_messages")
      .update({ is_favorite: false })
      .eq("id", messageId)

    if (error) {
      throw error
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error removing favorite:", error)
    return NextResponse.json(
      { error: "Failed to remove favorite" },
      { status: 500 }
    )
  }
}
