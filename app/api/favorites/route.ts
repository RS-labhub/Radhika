import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "../../../lib/supabase/server"
import { robustQuery, errorResponse, successResponse, CACHE_HEADERS } from "../../../lib/api-utils"

// GET /api/favorites - Get all favorite messages
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

    // Get all favorite messages with chat info (optimized query)
    const result: any = await robustQuery(
      () => supabase
        .from("chat_messages")
        .select(`
          id, content, role, created_at, is_favorite,
          chat:chats!inner(
            id,
            title,
            mode,
            user_id
          )
        `)
        .eq("is_favorite", true)
        .eq("chat.user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100), // Limit results
      { timeout: 8000, operationName: "Fetch favorites" }
    )

    if (result.error) {
      throw result.error
    }

    const response = successResponse({ favorites: result.data || [] })
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
    const { messageId } = body

    if (!messageId) {
      return errorResponse("Message ID is required", 400)
    }

    // Verify the message belongs to a chat owned by the user
    const messageCheck: any = await robustQuery(
      () => supabase
        .from("chat_messages")
        .select(`
          id,
          chat_id,
          chat:chats!inner(user_id)
        `)
        .eq("id", messageId)
        .eq("chat.user_id", user.id)
        .single(),
      { timeout: 5000, operationName: "Verify message ownership" }
    )

    if (messageCheck.error || !messageCheck.data) {
      return errorResponse("Message not found", 404)
    }

    // Insert into favorites table (upsert to handle duplicates)
    const favoriteResult: any = await robustQuery(
      () => supabase
        .from("favorites")
        .upsert({
          user_id: user.id,
          message_id: messageId,
          chat_id: messageCheck.data.chat_id,
        }, { onConflict: 'user_id,message_id' })
        .select()
        .single(),
      { timeout: 5000, operationName: "Add to favorites table" }
    )

    if (favoriteResult.error) {
      console.error("Error inserting into favorites table:", favoriteResult.error)
      // Continue anyway - the main thing is updating is_favorite flag
    }

    // Also update message to be favorite (for backward compatibility)
    const result: any = await robustQuery(
      () => supabase
        .from("chat_messages")
        .update({ is_favorite: true })
        .eq("id", messageId)
        .select()
        .single(),
      { timeout: 5000, operationName: "Add favorite" }
    )

    if (result.error) {
      throw result.error
    }

    return successResponse({ favorite: favoriteResult.data || result.data })
  } catch (error: any) {
    console.error("Error adding favorite:", error)
    return errorResponse(
      error.message?.includes("timed out") 
        ? "Request timed out. Please try again." 
        : "Failed to add favorite",
      error.message?.includes("timed out") ? 504 : 500
    )
  }
}

// DELETE /api/favorites - Remove a message from favorites
export async function DELETE(request: NextRequest) {
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
    const messageId = searchParams.get("messageId")

    if (!messageId) {
      return errorResponse("Message ID is required", 400)
    }

    // Delete from favorites table first
    const deleteResult: any = await robustQuery(
      () => supabase
        .from("favorites")
        .delete()
        .eq("user_id", user.id)
        .eq("message_id", messageId),
      { timeout: 5000, operationName: "Delete from favorites table" }
    )

    if (deleteResult.error) {
      console.error("Error deleting from favorites table:", deleteResult.error)
      // Continue anyway
    }

    // Also update message to remove favorite flag (for backward compatibility)
    const result: any = await robustQuery(
      () => supabase
        .from("chat_messages")
        .update({ is_favorite: false })
        .eq("id", messageId),
      { timeout: 5000, operationName: "Remove favorite" }
    )

    if (result.error) {
      // Non-critical error, just log
      console.error("Error updating is_favorite:", result.error)
    }

    return successResponse({ success: true })
  } catch (error: any) {
    console.error("Error removing favorite:", error)
    return errorResponse(
      error.message?.includes("timed out") 
        ? "Request timed out. Please try again." 
        : "Failed to remove favorite",
      error.message?.includes("timed out") ? 504 : 500
    )
  }
}
