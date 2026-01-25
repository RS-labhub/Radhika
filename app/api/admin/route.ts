import { NextRequest } from "next/server"
import { createServerAppwriteClient, createServiceClient, Query } from "@/lib/appwrite/server"
import { APPWRITE_CONFIG } from "@/lib/appwrite/config"
import { errorResponse, successResponse } from "@/lib/api-utils"

// Helper to get user from session or header (same as /api/users)
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

// Helper to verify admin access (user must be in reserved_emails)
async function verifyAdminAccess(request: NextRequest): Promise<{ user: any; isAdmin: boolean }> {
  const { account } = await createServerAppwriteClient()
  const serviceClient = createServiceClient()

  const user = await getUser(request, account, serviceClient)
  
  if (!user) {
    console.log("[Admin] No user found")
    return { user: null, isAdmin: false }
  }

  console.log("[Admin] Checking admin access for:", user.email)

  // Check if user email is in reserved_emails collection
  try {
    const reservedEmails = await serviceClient.databases.listDocuments(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.reservedEmails,
      [Query.equal("email", user.email)]
    )
    console.log("[Admin] Reserved emails query result:", {
      collectionId: APPWRITE_CONFIG.collections.reservedEmails,
      userEmail: user.email,
      found: reservedEmails.documents.length
    })
    return { user, isAdmin: reservedEmails.documents.length > 0 }
  } catch (error: any) {
    console.error("[Admin] Error checking reserved emails:", error?.message)
    return { user, isAdmin: false }
  }
}

// GET /api/admin - Get all users with their chats and stats
export async function GET(request: NextRequest) {
  try {
    const { user, isAdmin } = await verifyAdminAccess(request)
    
    if (!user) {
      return errorResponse("Unauthorized", 401)
    }
    
    if (!isAdmin) {
      return errorResponse("Forbidden - Admin access required", 403)
    }

    const serviceClient = createServiceClient()
    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get("page") || "1", 10)
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 100)
    const search = searchParams.get("search") || ""

    // Get all users from Appwrite
    const usersQuery: string[] = []
    if (search) {
      usersQuery.push(Query.search("email", search))
    }
    usersQuery.push(Query.limit(limit))
    usersQuery.push(Query.offset((page - 1) * limit))
    
    const usersResponse = await serviceClient.users.list(usersQuery)
    
    // Get stats for each user
    const usersWithStats = await Promise.all(
      usersResponse.users.map(async (appwriteUser: any) => {
        // Get user's chats count
        let chatCount = 0
        let messageCount = 0
        try {
          const chatsResponse = await serviceClient.databases.listDocuments(
            APPWRITE_CONFIG.databaseId,
            APPWRITE_CONFIG.collections.chats,
            [Query.equal("user_id", appwriteUser.$id), Query.limit(1)]
          )
          chatCount = chatsResponse.total

          // Sum up message counts from chats
          const allChatsResponse = await serviceClient.databases.listDocuments(
            APPWRITE_CONFIG.databaseId,
            APPWRITE_CONFIG.collections.chats,
            [Query.equal("user_id", appwriteUser.$id), Query.limit(1000)]
          )
          messageCount = allChatsResponse.documents.reduce((sum: number, chat: any) => sum + (chat.message_count || 0), 0)
        } catch (e) {
          // Ignore errors for individual user stats
        }

        // Get user profile
        let profile = null
        try {
          profile = await serviceClient.databases.getDocument(
            APPWRITE_CONFIG.databaseId,
            APPWRITE_CONFIG.collections.users,
            appwriteUser.$id
          )
        } catch {
          // Profile might not exist
        }

        return {
          id: appwriteUser.$id,
          email: appwriteUser.email,
          name: appwriteUser.name,
          labels: appwriteUser.labels || [],
          createdAt: appwriteUser.$createdAt,
          lastActivity: appwriteUser.accessedAt || appwriteUser.$updatedAt,
          profile: profile ? {
            display_name: profile.display_name,
            avatar_url: profile.avatar_url,
            is_creator: profile.is_creator
          } : null,
          stats: {
            chatCount,
            messageCount
          }
        }
      })
    )

    return successResponse({
      users: usersWithStats,
      total: usersResponse.total,
      page,
      limit,
      totalPages: Math.ceil(usersResponse.total / limit)
    })
  } catch (error: any) {
    console.error("Error fetching admin data:", error)
    return errorResponse("Failed to fetch admin data", 500)
  }
}
