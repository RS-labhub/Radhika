import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "../../../lib/supabase/server"

const MAX_PROFILES_PER_MODE = 3

// GET /api/profiles - Get all profiles for the authenticated user
export async function GET(request: NextRequest) {
  try {
  const supabase = (await createServerSupabaseClient()) as any
  const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const mode = searchParams.get("mode")

    let query = supabase
      .from("chat_profiles")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })

    if (mode) {
      query = query.eq("mode", mode)
    }

    const { data, error } = await query

    if (error) {
      throw error
    }

    return NextResponse.json({ profiles: data })
  } catch (error) {
    console.error("Error fetching profiles:", error)
    return NextResponse.json(
      { error: "Failed to fetch profiles" },
      { status: 500 }
    )
  }
}

// POST /api/profiles - Create a new profile
export async function POST(request: NextRequest) {
  try {
  const supabase = (await createServerSupabaseClient()) as any
  const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { mode, name, settings } = body

    if (!mode || !name) {
      return NextResponse.json(
        { error: "Mode and name are required" },
        { status: 400 }
      )
    }

    // Check profile limit
    const { data: existingProfiles, error: countError } = await supabase
      .from("chat_profiles")
      .select("id")
      .eq("user_id", user.id)
      .eq("mode", mode)

    if (countError) {
      throw countError
    }

    if (existingProfiles && existingProfiles.length >= MAX_PROFILES_PER_MODE) {
      return NextResponse.json(
        { error: `Maximum of ${MAX_PROFILES_PER_MODE} profiles per mode allowed` },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from("chat_profiles")
      .insert({
        user_id: user.id,
        mode,
        name,
        settings: settings || null,
      })
      .select()
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json({ profile: data }, { status: 201 })
  } catch (error) {
    console.error("Error creating profile:", error)
    return NextResponse.json(
      { error: "Failed to create profile" },
      { status: 500 }
    )
  }
}
