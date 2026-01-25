import { NextRequest } from "next/server"
import { createServerAppwriteClient, createServiceClient, Query, ID, Permission, Role } from "../../../../../lib/appwrite/server"
import { APPWRITE_CONFIG } from "../../../../../lib/appwrite/config"
import { errorResponse, successResponse } from "../../../../../lib/api-utils"

// Helper to get user from session or header
async function getUser(request: NextRequest, account: any, serviceClient: any) {
  try {
    return await account.get()
  } catch (error: any) {
    // Try to get user ID from header as fallback
    const userIdHeader = request.headers.get('x-user-id')
    if (userIdHeader) {
      try {
        return await serviceClient.users.get(userIdHeader)
      } catch {
        return null
      }
    }
    return null
  }
}

// GET /api/chats/[chatId]/messages - Get all messages for a chat
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
    const { account } = await createServerAppwriteClient()
    const serviceClient = createServiceClient()
    const { chatId } = await params

    // Auth check
    const user = await getUser(request, account, serviceClient)
    if (!user) {
      return errorResponse("Unauthorized", 401)
    }

    // Get query params
    const searchParams = request.nextUrl.searchParams
    const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 1000)
    const direction = searchParams.get("direction") || "asc"
    const cursor = searchParams.get("cursor")

    // Verify chat ownership using service client
    try {
      const chat = await serviceClient.databases.getDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.chats,
        chatId
      )
      
      if (chat.user_id !== user.$id) {
        return errorResponse("Chat not found", 404)
      }
    } catch {
      return errorResponse("Chat not found", 404)
    }

    // Build queries
    const queries = [
      Query.equal("chat_id", chatId),
      Query.limit(limit),
    ]

    if (direction === "asc") {
      queries.push(Query.orderAsc("created_at"))
    } else {
      queries.push(Query.orderDesc("created_at"))
    }

    if (cursor) {
      queries.push(Query.cursorAfter(cursor))
    }

    // Fetch messages using service client
    const result = await serviceClient.databases.listDocuments(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.chatMessages,
      queries
    )

    // Map documents
    const messages = result.documents.map((doc: any) => ({
      id: doc.$id,
      chat_id: doc.chat_id,
      role: doc.role,
      content: doc.content,
      metadata: doc.metadata,
      is_favorite: doc.is_favorite || false,
      created_at: doc.created_at || doc.$createdAt,
    }))

    return successResponse({ messages })
  } catch (error) {
    console.error("Error fetching messages:", error)
    return errorResponse("Failed to fetch messages", 500, error)
  }
}

// POST /api/chats/[chatId]/messages - Add a message to a chat
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
    const { account } = await createServerAppwriteClient()
    const serviceClient = createServiceClient()
    const { chatId } = await params

    // Auth check
    const user = await getUser(request, account, serviceClient)
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

    // Verify chat ownership using service client
    try {
      const chat = await serviceClient.databases.getDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.chats,
        chatId
      )
      
      if (chat.user_id !== user.$id) {
        return errorResponse("Chat not found", 404)
      }
    } catch {
      return errorResponse("Chat not found", 404)
    }

    // Create message using service client with user permissions
    // Serialize metadata to JSON string if it's an object
    const serializedMetadata = metadata 
      ? (typeof metadata === 'string' ? metadata : JSON.stringify(metadata))
      : null

    const message = await serviceClient.databases.createDocument(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.chatMessages,
      ID.unique(),
      {
        chat_id: chatId,
        role,
        content,
        metadata: serializedMetadata,
        is_favorite: false,
        created_at: new Date().toISOString()
      },
      [
        Permission.read(Role.user(user.$id)),
        Permission.update(Role.user(user.$id)),
        Permission.delete(Role.user(user.$id))
      ]
    )

    // Update chat's last_message_at, message_count, and last_message_preview
    try {
      // Get current message count
      const messagesCount = await serviceClient.databases.listDocuments(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.chatMessages,
        [Query.equal("chat_id", chatId), Query.limit(1)]
      )
      
      await serviceClient.databases.updateDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.chats,
        chatId,
        { 
          last_message_at: new Date().toISOString(),
          last_message_preview: content.substring(0, 200),
          message_count: messagesCount.total
        }
      )
    } catch (err) {
      console.warn("Failed to update chat metadata:", err)
    }

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
    const { account } = await createServerAppwriteClient()
    const serviceClient = createServiceClient()
    const { chatId } = await params

    // Auth check
    const user = await getUser(request, account, serviceClient)
    if (!user) {
      return errorResponse("Unauthorized", 401)
    }

    const body = await request.json()
    const { messageId, is_favorite } = body

    if (!messageId || typeof is_favorite !== "boolean") {
      return errorResponse("Message ID and is_favorite are required", 400)
    }

    // Verify message exists and belongs to the chat using service client
    let message
    try {
      message = await serviceClient.databases.getDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.chatMessages,
        messageId
      )
      
      if (message.chat_id !== chatId) {
        return errorResponse("Message not found", 404)
      }
    } catch {
      return errorResponse("Message not found", 404)
    }

    // Update the message using service client
    const updatedMessage = await serviceClient.databases.updateDocument(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.chatMessages,
      messageId,
      { is_favorite }
    )

    return successResponse({ message: updatedMessage })
  } catch (error) {
    console.error("Error updating message:", error)
    return errorResponse("Failed to update message", 500, error)
  }
}
