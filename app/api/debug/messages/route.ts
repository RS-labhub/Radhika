import { NextRequest, NextResponse } from "next/server"
import { createServerAppwriteClient, createServiceClient, Query } from "../../../../lib/appwrite/server"
import { APPWRITE_CONFIG } from "../../../../lib/appwrite/config"
import { getAuthenticatedUser } from "../../../../lib/api-utils"

// GET /api/debug/messages - Debug endpoint to check messages in database
export async function GET(request: NextRequest) {
  try {
    const { account, userId } = await createServerAppwriteClient()
    const serviceClient = createServiceClient()

    const user = await getAuthenticatedUser(request, account, serviceClient, userId)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get all chats for the user (use service client for consistent access)
    let chats: any[] = []
    try {
      const chatsResult = await serviceClient.databases.listDocuments(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.chats,
        [
          Query.equal('user_id', user.$id),
          Query.orderDesc('created_at'),
          Query.limit(10)
        ]
      )
      chats = chatsResult.documents
    } catch (e) {
      return NextResponse.json({ error: "Failed to fetch chats", details: e }, { status: 500 })
    }

    // Get all messages for these chats
    const chatIds = chats.map((chat: any) => chat.$id)
    
    let allMessages: any[] = []
    if (chatIds.length > 0) {
      for (const chatId of chatIds) {
        try {
          const messagesResult = await serviceClient.databases.listDocuments(
            APPWRITE_CONFIG.databaseId,
            APPWRITE_CONFIG.collections.chatMessages,
            [
              Query.equal('chat_id', chatId),
              Query.orderAsc('created_at'),
              Query.limit(100)
            ]
          )
          allMessages = allMessages.concat(messagesResult.documents)
        } catch (e) {
          console.warn("Failed to fetch messages for chat:", chatId, e)
        }
      }
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
        id: chat.$id,
        title: chat.title,
        mode: chat.mode,
        created_at: chat.created_at,
        messageCount: messagesByChat[chat.$id]?.length || 0,
        messages: (messagesByChat[chat.$id] || []).map((m: any) => ({
          id: m.$id,
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
