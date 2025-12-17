import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "../../../../lib/supabase/server"

// GET /api/profiles/[profileId] - Get a specific profile
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ profileId: string }> }
) {
  try {
  const supabase = (await createServerSupabaseClient()) as any
  const { data: { user } } = await supabase.auth.getUser()
    const { profileId } = await params

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data, error } = await supabase
      .from("chat_profiles")
      .select("*")
      .eq("id", profileId)
      .eq("user_id", user.id)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    return NextResponse.json({ profile: data })
  } catch (error) {
    console.error("Error fetching profile:", error)
    return NextResponse.json(
      { error: "Failed to fetch profile" },
      { status: 500 }
    )
  }
}

// PATCH /api/profiles/[profileId] - Update a profile
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ profileId: string }> }
) {
  try {
  const supabase = (await createServerSupabaseClient()) as any
  const { data: { user } } = await supabase.auth.getUser()
    const { profileId } = await params

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const allowedFields = ["name", "settings", "metadata"]
    const updates: Record<string, unknown> = {}

    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field]
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      )
    }

    updates.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from("chat_profiles")
      .update(updates)
      .eq("id", profileId)
      .eq("user_id", user.id)
      .select()
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json({ profile: data })
  } catch (error) {
    console.error("Error updating profile:", error)
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    )
  }
}

// DELETE /api/profiles/[profileId] - Delete a profile
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ profileId: string }> }
) {
  try {
  const supabase = (await createServerSupabaseClient()) as any
  const { data: { user } } = await supabase.auth.getUser()
    const { profileId } = await params

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { error } = await supabase
      .from("chat_profiles")
      .delete()
      .eq("id", profileId)
      .eq("user_id", user.id)

    if (error) {
      throw error
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting profile:", error)
    return NextResponse.json(
      { error: "Failed to delete profile" },
      { status: 500 }
    )
  }
}
