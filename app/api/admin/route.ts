import { NextRequest } from "next/server"
import { createServiceRoleClient, getAvatarPublicUrl } from "@/lib/supabase/server"
import { errorResponse, successResponse, getAuthenticatedUser, isReservedEmail } from "@/lib/api-utils"

// GET /api/admin - Get all users with their chats and stats
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser()

    if (!user) {
      return errorResponse("Unauthorized", 401)
    }

    if (!(await isReservedEmail(user.email))) {
      return errorResponse("Forbidden - Admin access required", 403)
    }

    const supabase = createServiceRoleClient()
    const searchParams = request.nextUrl.searchParams
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10) || 1, 1)
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10) || 20, 100)
    const search = searchParams.get("search") || ""

    let usersQuery = supabase
      .from("users")
      .select("id, email, display_name, avatar_url, role, created_at, updated_at, last_login_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    if (search) {
      usersQuery = usersQuery.ilike("email", `%${search.replace(/[\\%_]/g, "\\$&")}%`)
    }

    const { data: users, count, error: usersError } = await usersQuery
    if (usersError) throw usersError

    const total = count ?? 0
    const ids = (users || []).map((u) => u.id)

    const { data: profiles } = ids.length
      ? await supabase.from("profiles").select("id, is_creator").in("id", ids)
      : { data: [] as { id: string; is_creator: boolean | null }[] }
    const creatorById = new Map((profiles || []).map((p) => [p.id, p.is_creator === true]))

    const usersWithStats = await Promise.all(
      (users || []).map(async (u) => {
        let chatCount = 0
        let messageCount = 0
        try {
          const { data: chats, count: chatTotal } = await supabase
            .from("chats")
            .select("message_count", { count: "exact" })
            .eq("user_id", u.id)
            .limit(1000)
          chatCount = chatTotal ?? 0
          messageCount = (chats || []).reduce((sum, chat) => sum + (chat.message_count || 0), 0)
        } catch {
          // Ignore errors for individual user stats
        }

        return {
          id: u.id,
          email: u.email,
          name: u.display_name || "",
          labels: [] as string[],
          createdAt: u.created_at,
          lastActivity: u.last_login_at || u.updated_at,
          profile: {
            display_name: u.display_name,
            avatar_url: getAvatarPublicUrl(u.avatar_url),
            is_creator: creatorById.get(u.id) === true
          },
          stats: {
            chatCount,
            messageCount
          }
        }
      })
    )

    return successResponse({
      users: usersWithStats,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    })
  } catch (error: any) {
    console.error("Error fetching admin data:", error)
    return errorResponse("Failed to fetch admin data", 500)
  }
}
