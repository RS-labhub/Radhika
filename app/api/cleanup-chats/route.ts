import { NextResponse } from "next/server"
import { chatService } from "@/lib/supabase/chat-service"

/**
 * API endpoint to clean up old deleted chats
 * This can be called manually or set up as a cron job
 * 
 * To set up as a cron job on Vercel:
 * 1. Add vercel.json with cron configuration
 * 2. Or use a third-party service like cron-job.org to hit this endpoint daily
 */
export async function GET(request: Request) {
  try {
    // Optional: Add authentication to prevent unauthorized access
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET
    
    // If CRON_SECRET is set, require it in the Authorization header
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    // Run the cleanup
    const deletedCount = await chatService.cleanupOldDeletedChats()
    
    return NextResponse.json({
      success: true,
      deletedCount,
      message: `Successfully cleaned up ${deletedCount} old deleted chats`,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error("Cleanup error:", error)
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || "Failed to cleanup old chats" 
      },
      { status: 500 }
    )
  }
}

// Also allow POST for manual triggers
export async function POST(request: Request) {
  return GET(request)
}
