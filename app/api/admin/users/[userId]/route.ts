import { NextRequest } from "next/server"
import { AVATARS_BUCKET, createServiceRoleClient, getAvatarPublicUrl } from "@/lib/supabase/server"
import { errorResponse, successResponse, getAuthenticatedUser, isReservedEmail } from "@/lib/api-utils"

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function verifyAdminAccess() {
  const user = await getAuthenticatedUser()
  if (!user) return { user: null, isAdmin: false }
  return { user, isAdmin: await isReservedEmail(user.email) }
}

async function removeUserFiles(supabase: ReturnType<typeof createServiceRoleClient>, bucket: string, userId: string) {
  try {
    const { data: files } = await supabase.storage.from(bucket).list(userId, { limit: 1000 })
    if (files?.length) {
      await supabase.storage.from(bucket).remove(files.map((f) => `${userId}/${f.name}`))
    }
  } catch (e) {
    console.warn(`Admin: Could not delete files in ${bucket}:`, e)
  }
}

async function loadProfile(supabase: ReturnType<typeof createServiceRoleClient>, userId: string) {
  const [{ data: row }, { data: creator }] = await Promise.all([
    supabase
      .from("users")
      .select("id, email, display_name, avatar_url, pet_name, created_at, updated_at, last_login_at")
      .eq("id", userId)
      .maybeSingle(),
    supabase.from("profiles").select("is_creator").eq("id", userId).maybeSingle()
  ])
  return { row, isCreator: creator?.is_creator === true }
}

// GET /api/admin/users/[userId] - Get user details with all chats
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { user, isAdmin } = await verifyAdminAccess()

    if (!user) {
      return errorResponse("Unauthorized", 401)
    }

    if (!isAdmin) {
      return errorResponse("Forbidden - Admin access required", 403)
    }

    const { userId } = await params
    if (!UUID_REGEX.test(userId)) {
      return errorResponse("User not found", 404)
    }
    const supabase = createServiceRoleClient()

    const { row: targetUser, isCreator } = await loadProfile(supabase, userId)
    if (!targetUser) {
      return errorResponse("User not found", 404)
    }

    const { data: chatRows, count, error: chatsError } = await supabase
      .from("chats")
      .select("id, mode, title, message_count, last_message_preview, created_at, last_message_at, is_archived", { count: "exact" })
      .eq("user_id", userId)
      .order("last_message_at", { ascending: false })
      .limit(100)
    if (chatsError) throw chatsError

    const chats = (chatRows || []).map((chat) => ({
      id: chat.id,
      mode: chat.mode,
      title: chat.title,
      messageCount: chat.message_count || 0,
      lastMessagePreview: chat.last_message_preview,
      createdAt: chat.created_at,
      lastMessageAt: chat.last_message_at,
      isArchived: chat.is_archived || false
    }))

    return successResponse({
      user: {
        id: targetUser.id,
        email: targetUser.email,
        name: targetUser.display_name || "",
        labels: [] as string[],
        createdAt: targetUser.created_at,
        lastActivity: targetUser.last_login_at || targetUser.updated_at,
        profile: {
          display_name: targetUser.display_name,
          avatar_url: getAvatarPublicUrl(targetUser.avatar_url),
          is_creator: isCreator,
          pet_name: targetUser.pet_name
        }
      },
      chats,
      totalChats: count ?? 0
    })
  } catch (error: any) {
    console.error("Error fetching user details:", error)
    return errorResponse("Failed to fetch user details", 500)
  }
}

// DELETE /api/admin/users/[userId] - Delete a user and all their data
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { user, isAdmin } = await verifyAdminAccess()

    if (!user) {
      return errorResponse("Unauthorized", 401)
    }

    if (!isAdmin) {
      return errorResponse("Forbidden - Admin access required", 403)
    }

    const { userId } = await params
    if (!UUID_REGEX.test(userId)) {
      return errorResponse("User not found", 404)
    }

    if (userId === user.id) {
      return errorResponse("Cannot delete your own account", 400)
    }

    const supabase = createServiceRoleClient()

    await removeUserFiles(supabase, AVATARS_BUCKET, userId)
    await removeUserFiles(supabase, "chat-images", userId)

    // Deleting the auth user cascades to all public tables
    const { error } = await supabase.auth.admin.deleteUser(userId)
    if (error) throw error

    return successResponse({ message: "User deleted successfully" })
  } catch (error: any) {
    console.error("Error deleting user:", error)
    return errorResponse("Failed to delete user", 500)
  }
}

// PATCH /api/admin/users/[userId] - Update user profile (admin can modify avatar, settings)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { user, isAdmin } = await verifyAdminAccess()

    if (!user) {
      return errorResponse("Unauthorized", 401)
    }

    if (!isAdmin) {
      return errorResponse("Forbidden - Admin access required", 403)
    }

    const { userId } = await params
    if (!UUID_REGEX.test(userId)) {
      return errorResponse("User not found", 404)
    }
    const body = await request.json()
    const supabase = createServiceRoleClient()

    const { data: authData, error: authError } = await supabase.auth.admin.getUserById(userId)
    const targetUser = authData?.user
    if (authError || !targetUser) {
      return errorResponse("User not found", 404)
    }

    const userUpdates: Record<string, any> = {}

    if (body.deleteAvatar === true) {
      await removeUserFiles(supabase, AVATARS_BUCKET, userId)
      userUpdates.avatar_url = null
    }
    if (body.display_name !== undefined) {
      userUpdates.display_name = body.display_name
    }
    if (body.pet_name !== undefined) {
      userUpdates.pet_name = body.pet_name
    }

    if (Object.keys(userUpdates).length > 0) {
      userUpdates.updated_at = new Date().toISOString()
      const { error } = await supabase
        .from("users")
        .upsert({ id: userId, email: targetUser.email ?? "", ...userUpdates }, { onConflict: "id" })
      if (error) {
        console.error("Admin: Failed to update user profile:", error)
      }
    }

    if (body.is_creator !== undefined) {
      const { error } = await supabase
        .from("profiles")
        .upsert(
          { id: userId, email: targetUser.email ?? null, is_creator: body.is_creator === true, updated_at: new Date().toISOString() },
          { onConflict: "id" }
        )
      if (error) {
        console.error("Admin: Failed to update creator flag:", error)
      }
    }

    const { row, isCreator } = await loadProfile(supabase, userId)

    return successResponse({
      message: "User updated successfully",
      user: {
        id: targetUser.id,
        email: targetUser.email,
        name: row?.display_name || "",
        profile: row ? {
          display_name: row.display_name,
          avatar_url: getAvatarPublicUrl(row.avatar_url),
          pet_name: row.pet_name,
          is_creator: isCreator
        } : null
      }
    })
  } catch (error: any) {
    console.error("Error updating user:", error)
    return errorResponse("Failed to update user", 500)
  }
}
