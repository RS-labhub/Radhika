import { NextRequest } from "next/server"
import { createServerAppwriteClient, createServiceClient, Query } from "@/lib/appwrite/server"
import { APPWRITE_CONFIG } from "@/lib/appwrite/config"
import { errorResponse, successResponse } from "@/lib/api-utils"

// Helper to verify admin access (user must be in reserved_emails)
async function verifyAdminAccess(request: NextRequest): Promise<{ user: any; isAdmin: boolean }> {
  const { account } = await createServerAppwriteClient()
  const serviceClient = createServiceClient()

  let user: any = null
  try {
    user = await account.get()
  } catch (error: any) {
    const userIdHeader = request.headers.get('x-user-id')
    if (userIdHeader) {
      try {
        user = await serviceClient.users.get(userIdHeader)
      } catch {
        return { user: null, isAdmin: false }
      }
    }
  }

  if (!user) {
    return { user: null, isAdmin: false }
  }

  // Check if user email is in reserved_emails collection
  try {
    const reservedEmails = await serviceClient.databases.listDocuments(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.reservedEmails,
      [Query.equal("email", user.email)]
    )
    return { user, isAdmin: reservedEmails.documents.length > 0 }
  } catch {
    return { user, isAdmin: false }
  }
}

// GET /api/admin/chats/[chatId] - Get chat with all messages
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
    const { user, isAdmin } = await verifyAdminAccess(request)
    
    if (!user) {
      return errorResponse("Unauthorized", 401)
    }
    
    if (!isAdmin) {
      return errorResponse("Forbidden - Admin access required", 403)
    }

    const { chatId } = await params
    const serviceClient = createServiceClient()

    // Get chat
    const chat = await serviceClient.databases.getDocument(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.chats,
      chatId
    )

    // Get messages
    const messagesResponse = await serviceClient.databases.listDocuments(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.chatMessages,
      [
        Query.equal("chat_id", chatId),
        Query.orderAsc("created_at"),
        Query.limit(1000)
      ]
    )

    const messages = messagesResponse.documents.map((msg: any) => ({
      id: msg.$id,
      role: msg.role,
      content: msg.content,
      metadata: msg.metadata ? (typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : msg.metadata) : null,
      createdAt: msg.created_at || msg.$createdAt,
      isFavorite: msg.is_favorite || false
    }))

    return successResponse({
      chat: {
        id: chat.$id,
        userId: chat.user_id,
        mode: chat.mode,
        title: chat.title,
        messageCount: chat.message_count || 0,
        createdAt: chat.created_at || chat.$createdAt,
        lastMessageAt: chat.last_message_at,
        isArchived: chat.is_archived || false
      },
      messages,
      totalMessages: messagesResponse.total
    })
  } catch (error: any) {
    console.error("Error fetching chat details:", error)
    return errorResponse("Failed to fetch chat details", 500)
  }
}

// DELETE /api/admin/chats/[chatId] - Delete a chat and all its messages
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
    const { user, isAdmin } = await verifyAdminAccess(request)
    
    if (!user) {
      return errorResponse("Unauthorized", 401)
    }
    
    if (!isAdmin) {
      return errorResponse("Forbidden - Admin access required", 403)
    }

    const { chatId } = await params
    const serviceClient = createServiceClient()

    // Delete all messages first
    const messagesResponse = await serviceClient.databases.listDocuments(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.chatMessages,
      [Query.equal("chat_id", chatId), Query.limit(1000)]
    )

    for (const message of messagesResponse.documents) {
      await serviceClient.databases.deleteDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.chatMessages,
        message.$id
      )
    }

    // Delete the chat
    await serviceClient.databases.deleteDocument(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.chats,
      chatId
    )

    return successResponse({ message: "Chat deleted successfully" })
  } catch (error: any) {
    console.error("Error deleting chat:", error)
    return errorResponse("Failed to delete chat", 500)
  }
}
