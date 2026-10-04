import { NextRequest } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthenticatedUser, errorResponse, successResponse, CACHE_HEADERS } from "@/lib/api-utils"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /api/chats - Get all chats for the authenticated user
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return errorResponse("Unauthorized", 401)
    }

    const searchParams = request.nextUrl.searchParams
    const mode = searchParams.get("mode")
    const profileId = searchParams.get("profileId")
    const includeArchived = searchParams.get("includeArchived") === "true"
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10) || 50, 100)

    let chats: any[] = []

    if (!profileId || UUID_RE.test(profileId)) {
      const supabase = createServiceRoleClient()
      let query = supabase
        .from("chats")
        .select("id, title, mode, profile_id, user_id, last_message_at, created_at, updated_at, is_archived, message_count, last_message_preview")
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .order("last_message_at", { ascending: false })
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

      const { data, error } = await query
      if (error) throw error

      chats = (data || []).map((chat: any) => ({
        ...chat,
        is_archived: chat.is_archived || false,
        message_count: chat.message_count || 0,
      }))
    }

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
    const user = await getAuthenticatedUser()
    if (!user) {
      return errorResponse("Unauthorized", 401)
    }

    const body = await request.json()
    const { mode, title, profileId } = body

    if (!mode || !title) {
      return errorResponse("Mode and title are required", 400)
    }

    if (profileId && (typeof profileId !== "string" || !UUID_RE.test(profileId))) {
      return errorResponse("Invalid profileId", 400)
    }

    const supabase = createServiceRoleClient()
    const { data, error } = await supabase
      .from("chats")
      .insert({
        user_id: user.id,
        profile_id: profileId || null,
        mode,
        title,
      })
      .select("id, user_id, profile_id, mode, title, created_at, updated_at, last_message_at, is_archived")
      .single()

    if (error) throw error

    return successResponse({ chat: data }, 201)
  } catch (error: any) {
    console.error("Error creating chat:", error)
    return errorResponse("Failed to create chat", 500)
  }
}
