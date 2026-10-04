import { NextRequest } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthenticatedUser, errorResponse, successResponse, CACHE_HEADERS } from "@/lib/api-utils"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /api/favorites - Get all favorite messages for the user
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return errorResponse("Unauthorized", 401)
    }

    const supabase = createServiceRoleClient()
    const { data, error } = await supabase
      .from("favorites")
      .select("id, message_id, user_id, created_at, message:chat_messages(id, content, role, created_at, chat:chats(id, title, mode))")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100)

    if (error) throw error

    const favorites = (data || []).filter((fav: any) => fav.message)

    const response = successResponse({ favorites })
    Object.entries(CACHE_HEADERS.noCache).forEach(([key, value]) => {
      response.headers.set(key, value)
    })

    return response
  } catch (error: any) {
    console.error("Error fetching favorites:", error)
    return errorResponse(
      error.message?.includes("timed out")
        ? "Request timed out. Please try again."
        : "Failed to fetch favorites",
      error.message?.includes("timed out") ? 504 : 500
    )
  }
}

// POST /api/favorites - Add a message to favorites
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return errorResponse("Unauthorized", 401)
    }

    const body = await request.json()
    const { messageId } = body

    if (!messageId) {
      return errorResponse("Message ID is required", 400)
    }

    if (typeof messageId !== "string" || !UUID_RE.test(messageId)) {
      return errorResponse("Message not found", 404)
    }

    const supabase = createServiceRoleClient()

    const { data: message, error: messageError } = await supabase
      .from("chat_messages")
      .select("id, chat_id, chat:chats(user_id)")
      .eq("id", messageId)
      .maybeSingle()

    if (messageError || !message) {
      return errorResponse("Message not found", 404)
    }

    if ((message.chat as any)?.user_id !== user.id) {
      return errorResponse("Unauthorized to favorite this message", 403)
    }

    const { data: existing, error: existingError } = await supabase
      .from("favorites")
      .select("id")
      .eq("user_id", user.id)
      .eq("message_id", messageId)
      .limit(1)

    if (existingError) throw existingError
    if (existing && existing.length > 0) {
      return errorResponse("Message already favorited", 400)
    }

    const { data: favorite, error: insertError } = await supabase
      .from("favorites")
      .insert({
        user_id: user.id,
        message_id: messageId,
        chat_id: message.chat_id,
      })
      .select()
      .single()

    if (insertError) {
      if (insertError.code === "23505") {
        return errorResponse("Message already favorited", 400)
      }
      throw insertError
    }

    const { error: updateError } = await supabase
      .from("chat_messages")
      .update({ is_favorite: true })
      .eq("id", messageId)

    if (updateError) throw updateError

    return successResponse({ favorite }, 201)
  } catch (error: any) {
    console.error("Error adding favorite:", error)
    return errorResponse(
      error.message || "Failed to add favorite",
      500
    )
  }
}

// DELETE /api/favorites - Remove a message from favorites
export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return errorResponse("Unauthorized", 401)
    }

    const { searchParams } = new URL(request.url)
    const messageId = searchParams.get("messageId")
    const favoriteId = searchParams.get("favoriteId")

    if (!messageId && !favoriteId) {
      return errorResponse("Message ID or Favorite ID is required", 400)
    }

    const lookupColumn = favoriteId ? "id" : "message_id"
    const lookupValue = (favoriteId || messageId) as string

    if (!UUID_RE.test(lookupValue)) {
      return errorResponse("Favorite not found", 404)
    }

    const supabase = createServiceRoleClient()

    const { data: favoriteToDelete, error: findError } = await supabase
      .from("favorites")
      .select("id, message_id")
      .eq("user_id", user.id)
      .eq(lookupColumn, lookupValue)
      .limit(1)
      .maybeSingle()

    if (findError) throw findError
    if (!favoriteToDelete) {
      return errorResponse("Favorite not found", 404)
    }

    const { error: deleteError } = await supabase
      .from("favorites")
      .delete()
      .eq("id", favoriteToDelete.id)
      .eq("user_id", user.id)

    if (deleteError) throw deleteError

    const { error: updateError } = await supabase
      .from("chat_messages")
      .update({ is_favorite: false })
      .eq("id", favoriteToDelete.message_id)

    if (updateError) {
      console.error("Failed to update message favorite status:", updateError)
    }

    return successResponse({ success: true })
  } catch (error: any) {
    console.error("Error removing favorite:", error)
    return errorResponse(
      error.message || "Failed to remove favorite",
      500
    )
  }
}
