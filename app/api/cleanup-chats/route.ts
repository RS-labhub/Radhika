import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * API endpoint to clean up old deleted chats, sessions, and stale data
 * Called via Vercel Cron (see vercel.json):
 * - Daily at 2 AM: Basic cleanup
 * - Weekly on Sunday at 3 AM: Full cleanup
 */
export async function GET(request: Request) {
  try {
    // Verify authorization
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    const supabase = createServiceRoleClient()
    
    // Check if full cleanup is requested (weekly)
    const url = new URL(request.url)
    const fullCleanup = url.searchParams.get("full") === "true"
    
    const results: Record<string, number> = {}

    // Messages and favorites are removed by ON DELETE CASCADE
    // 1. Delete soft-deleted chats older than 2 days
    const { count: deletedChats, error: deletedChatsError } = await supabase
      .from("chats")
      .delete({ count: "exact" })
      .not("deleted_at", "is", null)
      .lt("deleted_at", new Date(Date.now() - 2 * DAY_MS).toISOString())
    if (deletedChatsError) console.error("Error cleaning up soft-deleted chats:", deletedChatsError)
    results.deleted_soft_deleted_chats = deletedChats || 0

    // 2. Clean up expired rate limits
    const { count: cleanedRateLimits, error: rateLimitsError } = await supabase
      .from("rate_limits")
      .delete({ count: "exact" })
      .lt("window_start", new Date(Date.now() - DAY_MS).toISOString())
    if (rateLimitsError) console.error("Error cleaning up rate limits:", rateLimitsError)
    results.cleaned_rate_limits = cleanedRateLimits || 0

    // 3. Clean up expired sessions
    const { count: cleanedSessions, error: sessionsError } = await supabase
      .from("user_sessions")
      .delete({ count: "exact" })
      .lt("expires_at", new Date().toISOString())
    if (sessionsError) console.error("Error cleaning up sessions:", sessionsError)
    results.cleaned_sessions = cleanedSessions || 0

    // 4. Full cleanup: Delete old chats (7+ days)
    if (fullCleanup) {
      const { count: oldChats, error: oldChatsError } = await supabase
        .from("chats")
        .delete({ count: "exact" })
        .is("deleted_at", null)
        .lt("created_at", new Date(Date.now() - 7 * DAY_MS).toISOString())
      if (oldChatsError) console.error("Error deleting old chats:", oldChatsError)
      results.deleted_old_chats = oldChats || 0
    }
    
    return NextResponse.json({
      success: true,
      ...results,
      fullCleanup,
      timestamp: new Date().toISOString(),
      message: "Cleanup completed successfully",
    })
  } catch (error: any) {
    console.error("Cleanup error:", error)
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || "Failed to cleanup" 
      },
      { status: 500 }
    )
  }
}

// Also allow POST for manual triggers
export async function POST(request: Request) {
  return GET(request)
}
