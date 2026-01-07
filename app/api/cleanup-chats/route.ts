import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

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

    // Create admin client for cleanup operations
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: "Missing Supabase configuration" },
        { status: 500 }
      )
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    // Check if full cleanup is requested (weekly)
    const url = new URL(request.url)
    const fullCleanup = url.searchParams.get("full") === "true"
    
    // Run the comprehensive cleanup function
    const { data, error } = await supabase.rpc("run_scheduled_cleanup")
    
    if (error) {
      console.error("Cleanup RPC error:", error)
      
      // Fallback to manual cleanup if RPC doesn't exist
      if (error.code === "42883") {
        return await runManualCleanup(supabase, fullCleanup)
      }
      
      throw error
    }
    
    return NextResponse.json({
      success: true,
      ...data,
      fullCleanup,
      message: `Cleanup completed successfully`,
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

// Fallback manual cleanup if RPC function doesn't exist
async function runManualCleanup(supabase: any, fullCleanup: boolean) {
  const results: Record<string, number> = {}
  
  // 1. Delete soft-deleted chats older than 2 days
  const { count: deletedChats } = await supabase
    .from("chats")
    .delete({ count: "exact" })
    .not("deleted_at", "is", null)
    .lt("deleted_at", new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString())
  
  results.deleted_soft_deleted_chats = deletedChats || 0
  
  // 2. Clean up expired rate limits
  const { count: cleanedRateLimits } = await supabase
    .from("rate_limits")
    .delete({ count: "exact" })
    .lt("window_start", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
  
  results.cleaned_rate_limits = cleanedRateLimits || 0
  
  // 3. Clean up expired sessions (if table exists)
  try {
    const { count: cleanedSessions } = await supabase
      .from("user_sessions")
      .delete({ count: "exact" })
      .lt("expires_at", new Date().toISOString())
    
    results.cleaned_sessions = cleanedSessions || 0
  } catch {
    results.cleaned_sessions = 0
  }
  
  // 4. Full cleanup: Delete old chats (7+ days)
  if (fullCleanup) {
    const { count: oldChats } = await supabase
      .from("chats")
      .delete({ count: "exact" })
      .is("deleted_at", null)
      .lt("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    
    results.deleted_old_chats = oldChats || 0
  }
  
  return NextResponse.json({
    success: true,
    ...results,
    fullCleanup,
    timestamp: new Date().toISOString(),
    message: "Manual cleanup completed successfully",
  })
}

// Also allow POST for manual triggers
export async function POST(request: Request) {
  return GET(request)
}
