import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "../../../lib/supabase/server"
import { robustQuery, errorResponse, successResponse, CACHE_HEADERS } from "../../../lib/api-utils"

// GET /api/chats - Get all chats for the authenticated user
export async function GET(request: NextRequest) {
  try {
    const supabase = (await createServerSupabaseClient()) as any
    
    // Get user with timeout
    const authResult: any = await robustQuery(
      () => supabase.auth.getUser(),
      { timeout: 5000, operationName: "Auth check" }
    )

    if (authResult.error || !authResult.data?.user) {
      return errorResponse("Unauthorized", 401)
    }

    const user = authResult.data.user

    const searchParams = request.nextUrl.searchParams
    const mode = searchParams.get("mode")
    const profileId = searchParams.get("profileId")
    const includeArchived = searchParams.get("includeArchived") === "true"
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100) // Cap at 100

    // Build and execute query with timeout
    const result: any = await robustQuery(
      async () => {
        let query = supabase
          .from("chats")
          .select("id, title, mode, profile_id, last_message_at, created_at, is_archived")
          .eq("user_id", user.id)
          .order("last_message_at", { ascending: false, nullsFirst: false })
          .limit(limit)

        if (mode) {
          query = query.eq("mode", mode)
        }

        if (profileId) {
          query = query.eq("profile_id", profileId)
        }

        if (!includeArchived) {
          query = query.eq("is_archived", false)
        }

        return query
      },
      { timeout: 8000, operationName: "Fetch chats" }
    )

    if (result.error) {
      throw result.error
    }

    const response = successResponse({ chats: result.data || [] })
    // Add cache headers
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
    const supabase = (await createServerSupabaseClient()) as any
    
    const authResult: any = await robustQuery(
      () => supabase.auth.getUser(),
      { timeout: 5000, operationName: "Auth check" }
    )

    if (authResult.error || !authResult.data?.user) {
      return errorResponse("Unauthorized", 401)
    }

    const user = authResult.data.user

    const body = await request.json()
    const { mode, title, profileId } = body

    if (!mode || !title) {
      return errorResponse("Mode and title are required", 400)
    }

    const result: any = await robustQuery(
      () => supabase
        .from("chats")
        .insert({
          user_id: user.id,
          mode,
          title,
          profile_id: profileId || null,
          last_message_at: new Date().toISOString(),
        })
        .select()
        .single(),
      { timeout: 8000, operationName: "Create chat" }
    )

    if (result.error) {
      throw result.error
    }

    return successResponse({ chat: result.data }, 201)
  } catch (error: any) {
    console.error("Error creating chat:", error)
    return errorResponse(
      error.message?.includes("timed out") 
        ? "Request timed out. Please try again." 
        : "Failed to create chat",
      error.message?.includes("timed out") ? 504 : 500
    )
  }
}
