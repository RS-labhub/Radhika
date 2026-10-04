import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { AVATARS_BUCKET, createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthenticatedUser } from "@/lib/api-utils"

async function removeUserFiles(supabase: ReturnType<typeof createServiceRoleClient>, bucket: string, userId: string) {
  try {
    const { data: files } = await supabase.storage.from(bucket).list(userId, { limit: 1000 })
    if (files?.length) {
      await supabase.storage.from(bucket).remove(files.map((f) => `${userId}/${f.name}`))
    }
  } catch (err) {
    console.warn(`Failed to delete files in ${bucket}:`, err)
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      console.error("[DELETE-ACCOUNT] Authentication failed - no user found")
      return NextResponse.json({ error: "Unauthorized - Please refresh the page and try again" }, { status: 401 })
    }

    const userId = user.id

    let body
    try {
      body = await request.json()
    } catch (parseErr) {
      console.error("[DELETE-ACCOUNT] Failed to parse request body:", parseErr)
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const { password } = body

    if (!password) {
      return NextResponse.json({ error: "Password is required for confirmation" }, { status: 400 })
    }

    console.log("[DELETE-ACCOUNT] Starting account deletion for user:", userId)

    const verifier = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { error: passwordError } = await verifier.auth.signInWithPassword({ email: user.email!, password })
    if (passwordError) {
      return NextResponse.json({ error: "Incorrect password" }, { status: 401 })
    }

    const supabase = createServiceRoleClient()

    await removeUserFiles(supabase, AVATARS_BUCKET, userId)
    await removeUserFiles(supabase, "chat-images", userId)

    // Deleting the auth user cascades to all public tables
    const { error } = await supabase.auth.admin.deleteUser(userId)
    if (error) {
      console.error("Failed to delete auth user:", error)
      return NextResponse.json({ error: "Failed to delete account" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("Error deleting account:", err)
    return NextResponse.json({ error: "Failed to delete account" }, { status: 500 })
  }
}
