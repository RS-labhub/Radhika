import { NextRequest, NextResponse } from "next/server"
import { createServerAppwriteClient, createServiceClient, Query } from "../../../../lib/appwrite/server"
import { APPWRITE_CONFIG } from "../../../../lib/appwrite/config"
import { errorResponse, successResponse } from "../../../../lib/api-utils"

// GET /api/chats/stats - Get chat statistics for the authenticated user
export async function GET(request: NextRequest) {
  try {
    const { account } = await createServerAppwriteClient()
    const serviceClient = createServiceClient()
    
    // Get user - try session first, then fall back to x-user-id header
    let user: any
    try {
      user = await account.get()
    } catch (error: any) {
      // Try to get user ID from header as fallback
      const userIdHeader = request.headers.get('x-user-id')
      if (userIdHeader) {
        // Verify user exists via service client
        try {
          user = await serviceClient.users.get(userIdHeader)
        } catch {
          return errorResponse("Unauthorized", 401)
        }
      } else {
        if (error.code === 401) {
          return errorResponse("Unauthorized", 401)
        }
        throw error
      }
    }

    // Try to get stats from user_stats collection first
    try {
      const statsResponse = await serviceClient.databases.listDocuments(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.userStats,
        [Query.equal("user_id", user.$id), Query.limit(1)]
      )

      if (statsResponse.documents.length > 0) {
        const stats = statsResponse.documents[0]
        // Handle chats_by_mode - it might be a JSON string or an object
        let chatsByMode = stats.chats_by_mode || {}
        if (typeof chatsByMode === 'string') {
          try {
            chatsByMode = JSON.parse(chatsByMode)
          } catch {
            chatsByMode = {}
          }
        }
        
        console.log(`Stats from user_stats for ${user.$id}:`, { 
          totalChats: stats.total_chats, 
          totalMessages: stats.total_messages, 
          chatsByMode 
        })
        
        return successResponse({
          stats: {
            totalChats: Number(stats.total_chats || 0),
            totalMessages: Number(stats.total_messages || 0),
            chatsByMode,
          }
        })
      }
    } catch (e) {
      console.warn("Could not read persisted user_stats, computing from chats:", e)
    }

    // Fallback: compute from live data
    const chatsResponse = await serviceClient.databases.listDocuments(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.chats,
      [
        Query.equal("user_id", user.$id),
        Query.equal("is_archived", false),
        Query.limit(1000)
      ]
    )

    const chats = chatsResponse.documents
    
    // Calculate stats from chats
    let totalMessages = 0
    const chatsByMode: Record<string, number> = {}
    
    chats.forEach((chat: any) => {
      totalMessages += chat.message_count || 0
      const mode = chat.mode || 'general'
      chatsByMode[mode] = (chatsByMode[mode] || 0) + 1
    })

    console.log(`📊 Chat stats for user ${user.$id}: ${chats.length} chats, ${totalMessages} messages, modes:`, chatsByMode)

    return successResponse({
      stats: {
        totalChats: chats.length,
        totalMessages,
        chatsByMode,
      }
    })
  } catch (error: any) {
    console.error("Error fetching chat stats:", error)
    return errorResponse("Failed to fetch chat stats", 500)
  }
}
