import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "../../../lib/supabase/server"
import { robustQuery, errorResponse, successResponse, CACHE_HEADERS } from "../../../lib/api-utils"

const MAX_PROFILES_PER_MODE = 3

// GET /api/profiles - Get all profiles for the authenticated user
export async function GET(request: NextRequest) {
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

    const searchParams = request.nextUrl.searchParams
    const mode = searchParams.get("mode")

    const result: any = await robustQuery(
      async () => {
        let query = supabase
          .from("chat_profiles")
          .select("id, name, mode, settings, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true })

        if (mode) {
          query = query.eq("mode", mode)
        }

        return query
      },
      { timeout: 8000, operationName: "Fetch profiles" }
    )

    if (result.error) {
      throw result.error
    }

    const response = successResponse({ profiles: result.data || [] })
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
    const { mode, name, settings } = body

    if (!mode || !name) {
      return errorResponse("Mode and name are required", 400)
    }

    // Check profile limit
    const countResult: any = await robustQuery(
      () => supabase
        .from("chat_profiles")
        .select("id")
        .eq("user_id", user.id)
        .eq("mode", mode),
      { timeout: 5000, operationName: "Check profile limit" }
    )

    if (countResult.error) {
      throw countResult.error
    }

    if (countResult.data && countResult.data.length >= MAX_PROFILES_PER_MODE) {
      return errorResponse(`Maximum of ${MAX_PROFILES_PER_MODE} profiles per mode allowed`, 400)
    }

    const result: any = await robustQuery(
      () => supabase
        .from("chat_profiles")
        .insert({
          user_id: user.id,
          mode,
          name,
          settings: settings || null,
        })
        .select()
        .single(),
      { timeout: 8000, operationName: "Create profile" }
    )

    if (result.error) {
      throw result.error
    }

    return successResponse({ profile: result.data }, 201)
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
