import { NextRequest } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthenticatedUser, errorResponse, successResponse, CACHE_HEADERS } from "@/lib/api-utils"

const MAX_PROFILES_PER_MODE = 3

// GET /api/profiles - Get all profiles for the authenticated user
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return errorResponse("Unauthorized", 401)
    }

    const mode = request.nextUrl.searchParams.get("mode")

    const supabase = createServiceRoleClient()
    let query = supabase
      .from("chat_profiles")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(100)

    if (mode) {
      query = query.eq("mode", mode)
    }

    const { data, error } = await query
    if (error) throw error

    const response = successResponse({ profiles: data || [] })
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
    const user = await getAuthenticatedUser()
    if (!user) {
      return errorResponse("Unauthorized", 401)
    }

    const body = await request.json()
    const { mode, name, settings } = body

    if (!mode || !name) {
      return errorResponse("Mode and name are required", 400)
    }

    const supabase = createServiceRoleClient()

    const { count, error: countError } = await supabase
      .from("chat_profiles")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("mode", mode)

    if (countError) throw countError

    if ((count || 0) >= MAX_PROFILES_PER_MODE) {
      return errorResponse(`Maximum of ${MAX_PROFILES_PER_MODE} profiles per mode allowed`, 400)
    }

    const { data: profile, error } = await supabase
      .from("chat_profiles")
      .insert({
        user_id: user.id,
        mode,
        name,
        settings: settings || {},
      })
      .select()
      .single()

    if (error) throw error

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
