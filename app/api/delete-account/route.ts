import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "../../../lib/supabase/server"
import { createClient } from "@supabase/supabase-js"

const AVATAR_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_AVATAR_BUCKET || "avatars"

function extractStoragePath(urlOrPath: string | null | undefined) {
  if (!urlOrPath) return null
  if (!urlOrPath.startsWith("http")) return urlOrPath
  const signMatch = urlOrPath.match(/storage\/v1\/object\/sign\/[^/]+\/([^?]+)/)
  if (signMatch?.[1]) return decodeURIComponent(signMatch[1])
  const publicMatch = urlOrPath.match(/storage\/v1\/object\/public\/([^?]+)/)
  if (publicMatch?.[1]) return decodeURIComponent(publicMatch[1])
  // fallback: try to find /avatars/<path>
  const avatarsIdx = urlOrPath.indexOf("/avatars/")
  if (avatarsIdx !== -1) return urlOrPath.substring(avatarsIdx + 1)
  return null
}

export async function POST(request: NextRequest) {
  try {
    const supabase = (await createServerSupabaseClient()) as any
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const hasServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY
    let admin: ReturnType<typeof createClient> | null = null
    if (hasServiceRole) {
      admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    } else {
      console.warn("SUPABASE_SERVICE_ROLE_KEY not provided; proceeding with best-effort app-data deletion only")
    }

    const dbClient: any = admin ?? supabase

    // 1) Fetch avatar path (may be storage path or public URL)
    const { data: existingUser } = await dbClient
      .from("users")
      .select("avatar_url")
      .eq("id", user.id)
      .single()

    const avatarPath = extractStoragePath(existingUser?.avatar_url)

    // 2) Delete favorites for this user
    try {
      await dbClient.from("favorites").delete().eq("user_id", user.id)
    } catch (err) {
      console.warn("Failed to delete favorites:", err)
    }

    // 3) Delete chat profiles, chats and messages
    try {
      const { data: chatsData } = await dbClient.from("chats").select("id").eq("user_id", user.id)
      const chatIds: string[] = (chatsData || []).map((c: any) => c.id)

      if (chatIds.length > 0) {
        await dbClient.from("chat_messages").delete().in("chat_id", chatIds)
        await dbClient.from("chats").delete().in("id", chatIds)
      }
    } catch (err) {
      console.warn("Failed to delete chats/messages:", err)
    }

    // 4) Delete chat profiles and user settings
    try {
      await dbClient.from("chat_profiles").delete().eq("user_id", user.id)
    } catch (err) {
      console.warn("Failed to delete chat_profiles:", err)
    }
    try {
      await dbClient.from("user_settings").delete().eq("user_id", user.id)
    } catch (err) {
      console.warn("Failed to delete user_settings:", err)
    }

    // 5) Delete the user row from users table
    try {
      await dbClient.from("users").delete().eq("id", user.id)
    } catch (err) {
      console.warn("Failed to delete users row:", err)
    }

    // 6) Remove avatar file from storage (best-effort)
    if (avatarPath) {
      try {
        await dbClient.storage.from(AVATAR_BUCKET).remove([avatarPath])
      } catch (err) {
        console.warn("Failed to remove avatar from storage", err)
      }
    }

    // 7) If we have a service role client, attempt to delete the Supabase auth user (admin)
    if (admin) {
      try {
        // @ts-ignore - admin.auth.admin exists on service_role clients
        await (admin.auth as any).admin.deleteUser(user.id)
      } catch (err) {
        console.error("Failed to delete auth user:", err)
        // Continue - we've removed app data; admin deletion may fail if key lacks permission
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("Error deleting account:", err)
    return NextResponse.json({ error: "Failed to delete account" }, { status: 500 })
  }
}
