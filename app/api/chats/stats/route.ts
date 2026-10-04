import { NextRequest } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthenticatedUser, errorResponse, successResponse } from "@/lib/api-utils"

// GET /api/chats/stats - Get chat statistics for the authenticated user
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return errorResponse("Unauthorized", 401)
    }

    const supabase = createServiceRoleClient()

    const { data: stats, error: statsError } = await supabase
      .from("user_stats")
      .select("total_chats, total_messages, chats_by_mode")
      .eq("user_id", user.id)
      .maybeSingle()

    if (statsError) {
      console.warn("Could not read persisted user_stats, computing from chats:", statsError.message)
    } else if (stats) {
      const chatsByMode: Record<string, number> = {}
      for (const [mode, count] of Object.entries((stats.chats_by_mode as Record<string, number>) || {})) {
        if (Number(count) > 0) chatsByMode[mode] = Number(count)
      }

      return successResponse({
        stats: {
          totalChats: Math.max(0, Number(stats.total_chats || 0)),
          totalMessages: Math.max(0, Number(stats.total_messages || 0)),
          chatsByMode,
        }
      })
    }

    const { data: chats, error } = await supabase
      .from("chats")
      .select("mode, message_count")
      .eq("user_id", user.id)
      .eq("is_archived", false)
      .limit(1000)

    if (error) throw error

    let totalMessages = 0
    const chatsByMode: Record<string, number> = {}

    ;(chats || []).forEach((chat: any) => {
      totalMessages += chat.message_count || 0
      const mode = chat.mode || "general"
      chatsByMode[mode] = (chatsByMode[mode] || 0) + 1
    })

    return successResponse({
      stats: {
        totalChats: chats?.length || 0,
        totalMessages,
        chatsByMode,
      }
    })
  } catch (error: any) {
    console.error("Error fetching chat stats:", error)
    return errorResponse("Failed to fetch chat stats", 500)
  }
}
