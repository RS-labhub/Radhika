import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthenticatedUser } from "@/lib/api-utils"

// GET /api/debug/messages - Debug endpoint to check messages in database
export async function GET() {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = createServiceRoleClient()

    const { data: chatRows, error: chatsError } = await supabase
      .from("chats")
      .select("id, title, mode, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10)
    if (chatsError) {
      return NextResponse.json({ error: "Failed to fetch chats", details: chatsError }, { status: 500 })
    }
    const chats = chatRows || []

    let allMessages: any[] = []
    for (const chat of chats) {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("id, chat_id, role, content, created_at")
        .eq("chat_id", chat.id)
        .order("created_at", { ascending: true })
        .order("seq_num", { ascending: true })
        .limit(100)
      if (error) {
        console.warn("Failed to fetch messages for chat:", chat.id, error)
        continue
      }
      allMessages = allMessages.concat(data || [])
    }

    const messagesByChat = allMessages.reduce((acc: Record<string, any[]>, msg) => {
      if (!acc[msg.chat_id]) {
        acc[msg.chat_id] = []
      }
      acc[msg.chat_id].push(msg)
      return acc
    }, {})

    const summary = {
      totalChats: chats.length,
      totalMessages: allMessages.length,
      messagesByRole: {
        user: allMessages.filter((m) => m.role === 'user').length,
        assistant: allMessages.filter((m) => m.role === 'assistant').length,
        system: allMessages.filter((m) => m.role === 'system').length,
      },
      chats: chats.map((chat) => ({
        id: chat.id,
        title: chat.title,
        mode: chat.mode,
        created_at: chat.created_at,
        messageCount: messagesByChat[chat.id]?.length || 0,
        messages: (messagesByChat[chat.id] || []).map((m) => ({
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
