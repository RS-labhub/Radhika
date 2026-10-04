import { NextRequest } from "next/server"
import { AVATARS_BUCKET, createServiceRoleClient } from "@/lib/supabase/server"
import { errorResponse, getAuthenticatedUser, successResponse } from "@/lib/api-utils"

const MAX_AVATAR_SIZE = 2 * 1024 * 1024

function getStoragePath(avatarUrl: string | null | undefined): string | null {
  if (!avatarUrl) return null
  const marker = `/object/public/${AVATARS_BUCKET}/`
  const index = avatarUrl.indexOf(marker)
  if (index === -1) return null
  const path = decodeURIComponent(avatarUrl.slice(index + marker.length).split("?")[0])
  return path.startsWith("/") ? null : path
}

async function removePreviousAvatar(supabase: ReturnType<typeof createServiceRoleClient>, userId: string, avatarUrl: string | null | undefined) {
  const path = getStoragePath(avatarUrl)
  if (!path || !path.startsWith(`${userId}/`)) return
  const { error } = await supabase.storage.from(AVATARS_BUCKET).remove([path])
  if (error) console.warn("Could not delete previous avatar:", error.message)
}

// POST /api/users/avatar - Upload avatar
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return errorResponse("Unauthorized", 401)
    }

    const formData = await request.formData()
    const file = (formData.get("file") || formData.get("avatar")) as File | null

    if (!file) {
      return errorResponse("No file provided", 400)
    }

    if (!file.type.startsWith("image/")) {
      return errorResponse("Invalid file type. Please upload an image.", 400)
    }

    if (file.size > MAX_AVATAR_SIZE) {
      return errorResponse("File too large. Max size is 2MB.", 400)
    }

    const supabase = createServiceRoleClient()

    const { data: existing } = await supabase.from("users").select("avatar_url").eq("id", user.id).maybeSingle()

    const rawExt = (file.name.split(".").pop() || file.type.split("/")[1] || "png").toLowerCase()
    const ext = rawExt.replace(/[^a-z0-9]/g, "").slice(0, 8) || "png"
    const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from(AVATARS_BUCKET)
      .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false })
    if (uploadError) {
      return errorResponse(uploadError.message || "Failed to upload avatar", 500, uploadError)
    }

    const avatarUrl = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(path).data.publicUrl

    const { error: updateError } = await supabase
      .from("users")
      .upsert({ id: user.id, email: user.email, avatar_url: avatarUrl }, { onConflict: "id" })
    if (updateError) {
      await supabase.storage.from(AVATARS_BUCKET).remove([path])
      return errorResponse("Failed to save avatar", 500, updateError)
    }

    await removePreviousAvatar(supabase, user.id, existing?.avatar_url)

    return successResponse({
      url: avatarUrl,
      avatarUrl,
      fileId: path,
    })
  } catch (error: any) {
    console.error("Error uploading avatar:", error)
    return errorResponse(error.message || "Failed to upload avatar", 500, error)
  }
}

// DELETE /api/users/avatar - Delete avatar
export async function DELETE() {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return errorResponse("Unauthorized", 401)
    }

    const supabase = createServiceRoleClient()

    const { data: existing } = await supabase.from("users").select("avatar_url").eq("id", user.id).maybeSingle()

    const { error } = await supabase.from("users").update({ avatar_url: null }).eq("id", user.id)
    if (error) {
      return errorResponse("Failed to delete avatar", 500, error)
    }

    await removePreviousAvatar(supabase, user.id, existing?.avatar_url)

    return successResponse({ success: true })
  } catch (error: any) {
    console.error("Error deleting avatar:", error)
    return errorResponse("Failed to delete avatar", 500, error)
  }
}
