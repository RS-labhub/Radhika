import { NextRequest } from "next/server"
import { createServerAppwriteClient, createServiceClient, Query } from "../../../../lib/appwrite/server"
import { APPWRITE_CONFIG } from "../../../../lib/appwrite/config"
import { errorResponse, successResponse } from "../../../../lib/api-utils"

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

// GET /api/chats/[chatId] - Get a specific chat with messages
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

    // Fetch chat using service client
    let chat
    try {
      chat = await serviceClient.databases.getDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.chats,
        chatId
      )
      
      // Verify ownership
      if (chat.user_id !== user.$id) {
        return errorResponse("Chat not found", 404)
      }
    } catch {
      return errorResponse("Chat not found", 404)
    }

    // Fetch messages using service client
    let messages: any[] = []
    try {
      const messagesResult = await serviceClient.databases.listDocuments(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.chatMessages,
        [
          Query.equal('chat_id', chatId),
          Query.orderAsc('created_at'),
          Query.limit(1000)
        ]
      )
      messages = messagesResult.documents
    } catch (e) {
      console.error("Error fetching messages:", e)
    }

    return successResponse({ chat, messages })
  } catch (error) {
    console.error("Error fetching chat:", error)
    return errorResponse("Failed to fetch chat", 500, error)
  }
}

// PATCH /api/chats/[chatId] - Update a chat (including sharing)
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
    
    // Handle share action
    if (body.action === 'share') {
      // Verify ownership first
      try {
        const chat = await serviceClient.databases.getDocument(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.chats,
          chatId
        )
        
        if (chat.user_id !== user.$id) {
          return errorResponse("Chat not found", 404)
        }
        
        // If already shared, return existing token
        if (chat.share_token && chat.is_public) {
          return successResponse({ share_token: chat.share_token })
        }
      } catch {
        return errorResponse("Chat not found", 404)
      }
      
      // Generate a unique share token
      const shareToken = crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      
      // Update the chat with share token
      const updatedChat = await serviceClient.databases.updateDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.chats,
        chatId,
        {
          share_token: shareToken,
          is_public: true,
          shared_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      )
      
      return successResponse({ share_token: shareToken })
    }
    
    // Handle unshare action
    if (body.action === 'unshare') {
      // Verify ownership first
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
      
      // Remove share token
      const updatedChat = await serviceClient.databases.updateDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.chats,
        chatId,
        {
          share_token: null,
          is_public: false,
          shared_at: null,
          updated_at: new Date().toISOString()
        }
      )
      
      return successResponse({ success: true })
    }
    
    // Regular update
    const allowedFields = ["title", "is_archived", "profile_id"]
    const updates: Record<string, unknown> = {}

    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field]
      }
    }

    if (Object.keys(updates).length === 0) {
      return errorResponse("No valid fields to update", 400)
    }

    updates.updated_at = new Date().toISOString()

    // Verify ownership first using service client
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

    // Update the chat using service client
    const updatedChat = await serviceClient.databases.updateDocument(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.chats,
      chatId,
      updates
    )

    return successResponse({ chat: updatedChat })
  } catch (error) {
    console.error("Error updating chat:", error)
    return errorResponse("Failed to update chat", 500, error)
  }
}

// DELETE /api/chats/[chatId] - Delete a chat
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
    const { account } = await createServerAppwriteClient()
    const serviceClient = createServiceClient()
    const { chatId } = await params

    console.log(`🗑️ DELETE /api/chats/${chatId} - Starting deletion...`)

    // Auth check
    const user = await getUser(request, account, serviceClient)
    if (!user) {
      console.log(`🗑️ DELETE /api/chats/${chatId} - Unauthorized (no user)`)
      return errorResponse("Unauthorized", 401)
    }

    console.log(`🗑️ DELETE /api/chats/${chatId} - User: ${user.$id}`)

    // Verify ownership first and get chat details for stats update
    let chatToDelete: any
    try {
      chatToDelete = await serviceClient.databases.getDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.chats,
        chatId
      )
      
      console.log(`🗑️ DELETE /api/chats/${chatId} - Chat found, owner: ${chatToDelete.user_id}, mode: ${chatToDelete.mode}, messages: ${chatToDelete.message_count}`)
      
      if (chatToDelete.user_id !== user.$id) {
        console.log(`🗑️ DELETE /api/chats/${chatId} - User ${user.$id} doesn't own this chat`)
        return errorResponse("Chat not found", 404)
      }
    } catch (e) {
      console.log(`🗑️ DELETE /api/chats/${chatId} - Chat not found in database:`, e)
      return errorResponse("Chat not found", 404)
    }

    // Delete all messages for this chat first (using service client)
    let deletedMessagesCount = 0
    try {
      const messages = await serviceClient.databases.listDocuments(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.chatMessages,
        [Query.equal('chat_id', chatId), Query.limit(1000)]
      )
      
      console.log(`🗑️ DELETE /api/chats/${chatId} - Deleting ${messages.documents.length} messages...`)
      deletedMessagesCount = messages.documents.length
      
      for (const msg of messages.documents) {
        await serviceClient.databases.deleteDocument(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.chatMessages,
          msg.$id
        )
      }
      
      console.log(`🗑️ DELETE /api/chats/${chatId} - Messages deleted successfully`)
    } catch (e) {
      console.error(`🗑️ DELETE /api/chats/${chatId} - Error deleting messages:`, e)
    }

    // Delete the chat using service client
    console.log(`🗑️ DELETE /api/chats/${chatId} - Deleting chat document...`)
    await serviceClient.databases.deleteDocument(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.chats,
      chatId
    )

    // Update user stats (decrement chat and message counts)
    try {
      const statsResponse = await serviceClient.databases.listDocuments(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.userStats,
        [Query.equal("user_id", user.$id), Query.limit(1)]
      )
      
      if (statsResponse.documents.length > 0) {
        const stats = statsResponse.documents[0]
        let chatsByMode = stats.chats_by_mode || {}
        if (typeof chatsByMode === 'string') {
          try { chatsByMode = JSON.parse(chatsByMode) } catch { chatsByMode = {} }
        }
        
        // Decrement the mode count
        const mode = chatToDelete.mode || 'general'
        if (chatsByMode[mode] && chatsByMode[mode] > 0) {
          chatsByMode[mode] = chatsByMode[mode] - 1
        }
        
        await serviceClient.databases.updateDocument(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.userStats,
          stats.$id,
          {
            total_chats: Math.max(0, (stats.total_chats || 0) - 1),
            total_messages: Math.max(0, (stats.total_messages || 0) - deletedMessagesCount),
            chats_by_mode: chatsByMode,
          }
        )
        console.log(`🗑️ DELETE /api/chats/${chatId} - User stats updated`)
      }
    } catch (e) {
      console.warn(`🗑️ DELETE /api/chats/${chatId} - Failed to update user stats:`, e)
    }

    console.log(`🗑️ DELETE /api/chats/${chatId} - Chat deleted successfully!`)
    return successResponse({ success: true })
  } catch (error) {
    console.error(`🗑️ DELETE - Error deleting chat:`, error)
    return errorResponse("Failed to delete chat", 500, error)
  }
}
