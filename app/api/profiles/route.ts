import { NextRequest } from "next/server"
import { createServerAppwriteClient, createServiceClient, Query, ID, Permission, Role } from "../../../lib/appwrite/server"
import { APPWRITE_CONFIG } from "../../../lib/appwrite/config"
import { errorResponse, successResponse, CACHE_HEADERS } from "../../../lib/api-utils"

const MAX_PROFILES_PER_MODE = 3

// GET /api/profiles - Get all profiles for the authenticated user
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

    // Build query
    const queries = [
      Query.equal('user_id', user.$id),
      Query.orderAsc('created_at'),
      Query.limit(100)
    ]
    
    if (mode) {
      queries.push(Query.equal('mode', mode))
    }

    // Use service client for elevated permissions
    const result = await serviceClient.databases.listDocuments(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.chatProfiles,
      queries
    )

    const response = successResponse({ profiles: result.documents || [] })
    Object.entries(CACHE_HEADERS.shortCache).forEach(([key, value]) => {
      response.headers.set(key, value)
    })
    
    return response
  } catch (error: any) {
    console.error("Error fetching profiles:", error)
    return errorResponse(
      error.message?.includes("timed out") 
        ? "Request timed out. Please try again." 
        : "Failed to fetch profiles",
      error.message?.includes("timed out") ? 504 : 500
    )
  }
}

// POST /api/profiles - Create a new profile
export async function POST(request: NextRequest) {
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

    const body = await request.json()
    const { mode, name, settings } = body

    if (!mode || !name) {
      return errorResponse("Mode and name are required", 400)
    }

    // Check profile limit using service client
    const existingProfiles = await serviceClient.databases.listDocuments(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.chatProfiles,
      [
        Query.equal('user_id', user.$id),
        Query.equal('mode', mode)
      ]
    )

    if (existingProfiles.documents.length >= MAX_PROFILES_PER_MODE) {
      return errorResponse(`Maximum of ${MAX_PROFILES_PER_MODE} profiles per mode allowed`, 400)
    }

    // Create profile using service client with user permissions
    const profile = await serviceClient.databases.createDocument(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.chatProfiles,
      ID.unique(),
      {
        user_id: user.$id,
        mode,
        name,
        settings: settings || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      [
        Permission.read(Role.user(user.$id)),
        Permission.update(Role.user(user.$id)),
        Permission.delete(Role.user(user.$id))
      ]
    )

    return successResponse({ profile }, 201)
  } catch (error: any) {
    console.error("Error creating profile:", error)
    return errorResponse(
      error.message?.includes("timed out") 
        ? "Request timed out. Please try again." 
        : "Failed to create profile",
      error.message?.includes("timed out") ? 504 : 500
    )
  }
}
