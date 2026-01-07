import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "../../../../lib/supabase/server"

// GET /api/debug/messages - Debug endpoint to check messages in database
export async function GET(request: NextRequest) {
  try {
    const supabase = (await createServerSupabaseClient()) as any
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get all chats for the user
    const { data: chats, error: chatsError } = await supabase
      .from("chats")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10)

    if (chatsError) {
      return NextResponse.json({ error: "Failed to fetch chats", details: chatsError }, { status: 500 })
    }

    // Get all messages for these chats
    const chatIds = chats.map((chat: any) => chat.id)
    
    let allMessages: any[] = []
    if (chatIds.length > 0) {
      const { data: messages, error: messagesError } = await supabase
        .from("chat_messages")
        .select("*")
        .in("chat_id", chatIds)
        .order("created_at", { ascending: true })

      if (messagesError) {
        return NextResponse.json({ error: "Failed to fetch messages", details: messagesError }, { status: 500 })
      }

      allMessages = messages || []
    }

    // Group messages by chat
    const messagesByChat = allMessages.reduce((acc: any, msg: any) => {
      if (!acc[msg.chat_id]) {
        acc[msg.chat_id] = []
      }
      acc[msg.chat_id].push(msg)
      return acc
    }, {})

    // Create summary
    const summary = {
      totalChats: chats.length,
      totalMessages: allMessages.length,
      messagesByRole: {
        user: allMessages.filter((m: any) => m.role === 'user').length,
        assistant: allMessages.filter((m: any) => m.role === 'assistant').length,
        system: allMessages.filter((m: any) => m.role === 'system').length,
      },
      chats: chats.map((chat: any) => ({
        id: chat.id,
        title: chat.title,
        mode: chat.mode,
        created_at: chat.created_at,
        messageCount: messagesByChat[chat.id]?.length || 0,
        messages: (messagesByChat[chat.id] || []).map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content.substring(0, 100) + (m.content.length > 100 ? '...' : ''),
          created_at: m.created_at
        }))
      }))
    }

    return NextResponse.json(summary)
  } catch (error) {
    console.error("Debug endpoint error:", error)
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
