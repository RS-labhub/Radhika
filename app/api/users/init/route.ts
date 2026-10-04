import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthenticatedUser } from "@/lib/api-utils"

// POST /api/users/init - Ensure user and settings rows exist for the signed-in user
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser()
    if (!user || !user.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const displayName =
      typeof body?.displayName === "string" && body.displayName.trim() ? body.displayName.trim() : null

    const supabase = createServiceRoleClient()

    const { data: existing } = await supabase.from("users").select("display_name").eq("id", user.id).maybeSingle()

    const userRow: Record<string, any> = { id: user.id, email: user.email }
    if (!existing) userRow.role = "authenticated"
    if (displayName && !existing?.display_name) userRow.display_name = displayName

    const { error: userError } = await supabase.from("users").upsert(userRow, { onConflict: "id" })
    if (userError) throw userError

    const { error: settingsError } = await supabase
      .from("user_settings")
      .upsert({ user_id: user.id }, { onConflict: "user_id", ignoreDuplicates: true })
    if (settingsError) console.error("Settings creation error:", settingsError)

    const { error: statsError } = await supabase
      .from("user_stats")
      .upsert({ user_id: user.id }, { onConflict: "user_id", ignoreDuplicates: true })
    if (statsError) console.error("Stats creation error:", statsError)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error initializing user:", error)
    return NextResponse.json({ error: error.message || "Failed to initialize user" }, { status: 500 })
  }
}
