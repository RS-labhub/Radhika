import { NextRequest } from "next/server"
import { createServiceClient, Query } from "../../../../lib/appwrite/server"
import { APPWRITE_CONFIG } from "../../../../lib/appwrite/config"
import { errorResponse, successResponse } from "../../../../lib/api-utils"

// GET /api/share/[token] - Get a shared chat by token (public access)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const serviceClient = createServiceClient()
    const { token } = await params

    if (!token) {
      return errorResponse("Token is required", 400)
    }

    // Find chat by share token using service client (no auth needed)
    const chatsResult = await serviceClient.databases.listDocuments(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.chats,
      [
        Query.equal('share_token', token),
        Query.equal('is_public', true),
        Query.limit(1),
      ]
    )

    if (chatsResult.documents.length === 0) {
      return errorResponse("Chat not found or not shared", 404)
    }

    const chat = chatsResult.documents[0]

    // Fetch messages for this chat
    const messagesResult = await serviceClient.databases.listDocuments(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.chatMessages,
      [
        Query.equal('chat_id', chat.$id),
        Query.orderAsc('created_at'),
        Query.limit(1000),
      ]
    )

    // Return chat and messages
    return successResponse({
      chat: {
        id: chat.$id,
        title: chat.title,
        mode: chat.mode,
        created_at: chat.created_at,
        updated_at: chat.updated_at,
        share_token: chat.share_token,
        is_public: chat.is_public,
      },
      messages: messagesResult.documents.map((msg: any) => ({
        id: msg.$id,
        role: msg.role,
        content: msg.content,
        created_at: msg.created_at,
        metadata: msg.metadata,
      })),
    })
  } catch (error: any) {
    console.error("Error fetching shared chat:", error)
    return errorResponse(
      error.message || "Failed to fetch shared chat",
      500,
      error
    )
  }
}
