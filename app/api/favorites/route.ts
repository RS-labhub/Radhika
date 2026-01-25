import { NextRequest, NextResponse } from "next/server"
import { createServerAppwriteClient, createServiceClient, Query } from "../../../lib/appwrite/server"
import { APPWRITE_CONFIG } from "../../../lib/appwrite/config"
import { errorResponse, successResponse, CACHE_HEADERS } from "../../../lib/api-utils"
import { ID, Permission, Role } from "node-appwrite"

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

// GET /api/favorites - Get all favorite messages for the user
export async function GET(request: NextRequest) {
  try {
    const { account } = await createServerAppwriteClient()
    const serviceClient = createServiceClient()
    
    // Get user
    const user = await getUser(request, account, serviceClient)
    if (!user) {
      return errorResponse("Unauthorized", 401)
    }

    // Get all favorites for this user using service client
    const favoritesResult = await serviceClient.databases.listDocuments(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.favorites,
      [
        Query.equal("user_id", user.$id),
        Query.orderDesc("created_at"),
        Query.limit(100),
      ]
    )

    // Get the associated messages using service client
    const favorites = await Promise.all(
      favoritesResult.documents.map(async (fav: any) => {
        try {
          const message = await serviceClient.databases.getDocument(
            APPWRITE_CONFIG.databaseId,
            APPWRITE_CONFIG.collections.chatMessages,
            fav.message_id
          )

          // Get the chat info
          let chat = null
          try {
            chat = await serviceClient.databases.getDocument(
              APPWRITE_CONFIG.databaseId,
              APPWRITE_CONFIG.collections.chats,
              message.chat_id
            )
          } catch (err) {
            console.error("Failed to fetch chat for favorite:", err)
          }

          return {
            id: fav.$id,
            message_id: fav.message_id,
            user_id: fav.user_id,
            created_at: fav.created_at || fav.$createdAt,
            message: {
              id: message.$id,
              content: message.content,
              role: message.role,
              created_at: message.created_at || message.$createdAt,
              chat: chat ? {
                id: chat.$id,
                title: chat.title,
                mode: chat.mode,
              } : null,
            },
          }
        } catch (err) {
          console.error("Failed to fetch message for favorite:", err)
          return null
        }
      })
    )

    const response = successResponse({ 
      favorites: favorites.filter((f: any) => f !== null) 
    })
    Object.entries(CACHE_HEADERS.noCache).forEach(([key, value]) => {
      response.headers.set(key, value)
    })
    
    return response
  } catch (error: any) {
    console.error("Error fetching favorites:", error)
    return errorResponse(
      error.message?.includes("timed out") 
        ? "Request timed out. Please try again." 
        : "Failed to fetch favorites",
      error.message?.includes("timed out") ? 504 : 500
    )
  }
}

// POST /api/favorites - Add a message to favorites
export async function POST(request: NextRequest) {
  try {
    const { account } = await createServerAppwriteClient()
    const serviceClient = createServiceClient()
    const { databases } = serviceClient // Use service client for creation
    
    // Get user
    const user = await getUser(request, account, serviceClient)
    if (!user) {
      return errorResponse("Unauthorized", 401)
    }

    const body = await request.json()
    const { messageId, chatId } = body

    if (!messageId) {
      return errorResponse("Message ID is required", 400)
    }

    // Verify the message exists and belongs to user's chat
    try {
      const message = await databases.getDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.chatMessages,
        messageId
      )

      const chat = await databases.getDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.chats,
        message.chat_id
      )

      if (chat.user_id !== user.$id) {
        return errorResponse("Unauthorized to favorite this message", 403)
      }
    } catch (error) {
      return errorResponse("Message not found", 404)
    }

    // Check if already favorited
    const existing = await databases.listDocuments(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.favorites,
      [
        Query.equal("user_id", user.$id),
        Query.equal("message_id", messageId),
        Query.limit(1),
      ]
    )

    if (existing.documents.length > 0) {
      return errorResponse("Message already favorited", 400)
    }

    // Create favorite with permissions
    const favorite = await databases.createDocument(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.favorites,
      ID.unique(),
      {
        user_id: user.$id,
        message_id: messageId,
        chat_id: chatId || null,
        created_at: new Date().toISOString(),
      },
      [
        Permission.read(Role.user(user.$id)),
        Permission.update(Role.user(user.$id)),
        Permission.delete(Role.user(user.$id)),
      ]
    )

    // Update message to mark as favorite
    await databases.updateDocument(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.chatMessages,
      messageId,
      { is_favorite: true }
    )

    return successResponse({ favorite }, 201)
  } catch (error: any) {
    console.error("Error adding favorite:", error)
    return errorResponse(
      error.message || "Failed to add favorite",
      500
    )
  }
}

// DELETE /api/favorites - Remove a message from favorites
export async function DELETE(request: NextRequest) {
  try {
    const { account } = await createServerAppwriteClient()
    const serviceClient = createServiceClient()
    const { databases } = serviceClient // Use service client for deletion
    
    // Get user
    const user = await getUser(request, account, serviceClient)
    if (!user) {
      return errorResponse("Unauthorized", 401)
    }

    const { searchParams } = new URL(request.url)
    const messageId = searchParams.get("messageId")
    const favoriteId = searchParams.get("favoriteId")

    if (!messageId && !favoriteId) {
      return errorResponse("Message ID or Favorite ID is required", 400)
    }

    // Find the favorite
    let favoriteToDelete: any
    if (favoriteId) {
      try {
        favoriteToDelete = await databases.getDocument(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.favorites,
          favoriteId
        )
        
        if (favoriteToDelete.user_id !== user.$id) {
          return errorResponse("Unauthorized", 403)
        }
      } catch (error) {
        return errorResponse("Favorite not found", 404)
      }
    } else if (messageId) {
      const result = await databases.listDocuments(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.favorites,
        [
          Query.equal("user_id", user.$id),
          Query.equal("message_id", messageId),
          Query.limit(1),
        ]
      )

      if (result.documents.length === 0) {
        return errorResponse("Favorite not found", 404)
      }

      favoriteToDelete = result.documents[0]
    }

    // Delete the favorite
    await databases.deleteDocument(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.favorites,
      favoriteToDelete.$id
    )

    // Update message to mark as not favorite
    if (favoriteToDelete.message_id) {
      try {
        await databases.updateDocument(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.chatMessages,
          favoriteToDelete.message_id,
          { is_favorite: false }
        )
      } catch (err) {
        // Non-fatal
        console.error("Failed to update message favorite status:", err)
      }
    }

    return successResponse({ success: true })
  } catch (error: any) {
    console.error("Error removing favorite:", error)
    return errorResponse(
      error.message || "Failed to remove favorite",
      500
    )
  }
}
