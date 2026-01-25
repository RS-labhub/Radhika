import { NextRequest, NextResponse } from "next/server"
import { createServerAppwriteClient, createServiceClient, Query, ID, Permission, Role } from "../../../lib/appwrite/server"
import { APPWRITE_CONFIG } from "../../../lib/appwrite/config"
import { robustQuery, errorResponse, successResponse, CACHE_HEADERS } from "../../../lib/api-utils"

// GET /api/chats - Get all chats for the authenticated user
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

    const searchParams = request.nextUrl.searchParams
    const mode = searchParams.get("mode")
    const profileId = searchParams.get("profileId")
    const includeArchived = searchParams.get("includeArchived") === "true"
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100)

    // Build queries
    const queries = [
      Query.equal("user_id", user.$id),
      Query.orderDesc("last_message_at"),
      Query.limit(limit),
      Query.isNull("deleted_at"),
    ]

    if (mode) {
      queries.push(Query.equal("mode", mode))
    }

    if (profileId) {
      queries.push(Query.equal("profile_id", profileId))
    }

    if (!includeArchived) {
      queries.push(Query.equal("is_archived", false))
    }

    // Use service client for elevated permissions
    const result = await serviceClient.databases.listDocuments(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.chats,
      queries
    )

    // Map documents to expected format
    const chats = result.documents.map((doc: any) => ({
      id: doc.$id,
      title: doc.title,
      mode: doc.mode,
      profile_id: doc.profile_id,
      user_id: doc.user_id,
      last_message_at: doc.last_message_at,
      created_at: doc.created_at || doc.$createdAt,
      updated_at: doc.updated_at || doc.$updatedAt,
      is_archived: doc.is_archived || false,
      message_count: doc.message_count || 0,
      last_message_preview: doc.last_message_preview,
    }))

    const response = successResponse({ chats })
    Object.entries(CACHE_HEADERS.noCache).forEach(([key, value]) => {
      response.headers.set(key, value)
    })
    
    return response
  } catch (error: any) {
    console.error("Error fetching chats:", error)
    return errorResponse(
      error.message?.includes("timed out") 
        ? "Request timed out. Please try again." 
        : "Failed to fetch chats",
      error.message?.includes("timed out") ? 504 : 500
    )
  }
}

// POST /api/chats - Create a new chat
export async function POST(request: NextRequest) {
  try {
    // Get user ID from request header (set by middleware or client)
    // Or try to get from session cookie
    const { account } = await createServerAppwriteClient()
    const serviceClient = createServiceClient()
    
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

    const body = await request.json()
    const { mode, title, profileId } = body

    if (!mode || !title) {
      return errorResponse("Mode and title are required", 400)
    }

    const now = new Date().toISOString()

    // Use service client for document creation with user permissions
    const doc = await serviceClient.databases.createDocument(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.chats,
      ID.unique(),
      {
        user_id: user.$id,
        profile_id: profileId || null,
        mode,
        title,
        message_count: 0,
        last_message_preview: null,
        created_at: now,
        updated_at: now,
        last_message_at: now,
        is_archived: false,
        deleted_at: null,
        is_public: false,
        share_token: null,
        shared_at: null,
      },
      [
        Permission.read(Role.user(user.$id)),
        Permission.update(Role.user(user.$id)),
        Permission.delete(Role.user(user.$id)),
      ]
    )

    return successResponse({
      chat: {
        id: doc.$id,
        user_id: doc.user_id,
        profile_id: doc.profile_id,
        mode: doc.mode,
        title: doc.title,
        created_at: doc.created_at,
        updated_at: doc.updated_at,
        last_message_at: doc.last_message_at,
        is_archived: doc.is_archived,
      }
    }, 201)
  } catch (error: any) {
    console.error("Error creating chat:", error)
    return errorResponse("Failed to create chat", 500)
  }
}
