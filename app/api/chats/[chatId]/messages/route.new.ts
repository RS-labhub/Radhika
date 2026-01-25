import { NextRequest, NextResponse } from "next/server"
import { createServerAppwriteClient, createServiceClient, Query, ID } from "../../../../../lib/appwrite/server"
import { APPWRITE_CONFIG } from "../../../../../lib/appwrite/config"
import { errorResponse, successResponse } from "../../../../../lib/api-utils"
import { Permission, Role } from "node-appwrite"

// POST /api/chats/[chatId]/messages - Add a message to a chat
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
    const { account } = await createServerAppwriteClient()
    const { databases } = createServiceClient() // Use service client for creation
    const { chatId } = await params

    // Get user
    let user: any
    try {
      user = await account.get()
    } catch (error: any) {
      if (error.code === 401) {
        return errorResponse("Unauthorized", 401)
      }
      throw error
    }

    const body = await request.json()
    const { role, content, metadata } = body

    if (!role || !content) {
      return errorResponse("Role and content are required", 400)
    }

    if (!["user", "assistant", "system"].includes(role)) {
      return errorResponse("Invalid role", 400)
    }

    // Verify chat exists and belongs to user
    try {
      const chat = await databases.getDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.chats,
        chatId
      )

      if (chat.user_id !== user.$id) {
        return errorResponse("Unauthorized to add messages to this chat", 403)
      }
    } catch (error: any) {
      if (error.code === 404) {
        return errorResponse("Chat not found", 404)
      }
      throw error
    }

    // Get current message count for seq_num
    const messagesCount = await databases.listDocuments(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.chatMessages,
      [
        Query.equal("chat_id", chatId),
        Query.limit(1),
      ]
    )

    // Insert message with document-level permissions
    const message = await databases.createDocument(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.chatMessages,
      ID.unique(),
      {
        chat_id: chatId,
        role,
        content,
        metadata: metadata ? JSON.stringify(metadata) : null,
        is_favorite: false,
        seq_num: messagesCount.total + 1,
        created_at: new Date().toISOString(),
      },
      [
        Permission.read(Role.user(user.$id)),
        Permission.update(Role.user(user.$id)),
        Permission.delete(Role.user(user.$id)),
      ]
    )

    // Update chat's last_message_at and message count (non-blocking)
    databases.updateDocument(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.chats,
      chatId,
      {
        last_message_at: new Date().toISOString(),
        last_message_preview: content.substring(0, 100),
        message_count: messagesCount.total + 1,
        updated_at: new Date().toISOString(),
      }
    ).catch(err => console.warn("Failed to update chat timestamp:", err))

    return successResponse({ 
      message: {
        id: message.$id,
        chat_id: message.chat_id,
        role: message.role,
        content: message.content,
        metadata: message.metadata ? JSON.parse(message.metadata) : null,
        is_favorite: message.is_favorite,
        seq_num: message.seq_num,
        created_at: message.created_at || message.$createdAt,
      }
    }, 201)
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
    const { databases } = createServiceClient() // Use service client for updates
    const { chatId } = await params

    // Get user
    let user: any
    try {
      user = await account.get()
    } catch (error: any) {
      if (error.code === 401) {
        return errorResponse("Unauthorized", 401)
      }
      throw error
    }

    const body = await request.json()
    const { messageId, is_favorite } = body

    if (!messageId || typeof is_favorite !== "boolean") {
      return errorResponse("Message ID and is_favorite are required", 400)
    }

    // Verify message exists and belongs to this chat
    try {
      const message = await databases.getDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.chatMessages,
        messageId
      )

      if (message.chat_id !== chatId) {
        return errorResponse("Message not found in this chat", 404)
      }

      // Verify chat belongs to user
      const chat = await databases.getDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.chats,
        chatId
      )

      if (chat.user_id !== user.$id) {
        return errorResponse("Unauthorized", 403)
      }
    } catch (error: any) {
      if (error.code === 404) {
        return errorResponse("Message not found", 404)
      }
      throw error
    }

    // Update message
    const updatedMessage = await databases.updateDocument(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.chatMessages,
      messageId,
      { is_favorite }
    )

    return successResponse({ 
      message: {
        id: updatedMessage.$id,
        chat_id: updatedMessage.chat_id,
        role: updatedMessage.role,
        content: updatedMessage.content,
        is_favorite: updatedMessage.is_favorite,
        created_at: updatedMessage.created_at || updatedMessage.$createdAt,
      }
    })
  } catch (error) {
    console.error("Error updating message:", error)
    return errorResponse("Failed to update message", 500, error)
  }
}
