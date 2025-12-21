import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "../../../lib/supabase/server"

// GET /api/chats - Get all chats for the authenticated user
export async function GET(request: NextRequest) {
  try {
  const supabase = (await createServerSupabaseClient()) as any
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const mode = searchParams.get("mode")
    const profileId = searchParams.get("profileId")
    const includeArchived = searchParams.get("includeArchived") === "true"
    const limit = parseInt(searchParams.get("limit") || "30", 10)

    let query = supabase
      .from("chats")
      .select("id,title,mode,profile_id,last_message_at,created_at,is_archived,deleted_at")
      .eq("user_id", user.id)
      .is("deleted_at", null)
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

    const { data, error } = await query

    if (error) {
      throw error
    }

    return NextResponse.json({ chats: data })
  } catch (error) {
    console.error("Error fetching chats:", error)
    return NextResponse.json(
      { error: "Failed to fetch chats" },
      { status: 500 }
    )
  }
}

// POST /api/chats - Create a new chat
export async function POST(request: NextRequest) {
  try {
    const supabase = (await createServerSupabaseClient()) as any
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { mode, title, profileId } = body

    if (!mode || !title) {
      return NextResponse.json(
        { error: "Mode and title are required" },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from("chats")
      .insert({
        user_id: user.id,
        mode,
        title,
        profile_id: profileId || null,
        last_message_at: new Date().toISOString(),
      })
      .select("id,title,mode,profile_id,last_message_at,created_at,is_archived,deleted_at")
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json({ chat: data }, { status: 201 })
  } catch (error) {
    console.error("Error creating chat:", error)
    return NextResponse.json(
      { error: "Failed to create chat" },
      { status: 500 }
    )
  }
}
