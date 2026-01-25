import { NextResponse } from "next/server"
import { createServiceClient, Query } from "@/lib/appwrite/server"
import { APPWRITE_CONFIG } from "@/lib/appwrite/config"

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

    // Create service client for cleanup operations
    const serviceClient = createServiceClient()
    
    // Check if full cleanup is requested (weekly)
    const url = new URL(request.url)
    const fullCleanup = url.searchParams.get("full") === "true"
    
    const results: Record<string, number> = {}

    // 1. Delete soft-deleted chats older than 2 days
    try {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
      const deletedChats = await serviceClient.databases.listDocuments(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.chats,
        [
          Query.isNotNull('deleted_at'),
          Query.lessThan('deleted_at', twoDaysAgo),
          Query.limit(100)
        ]
      )
      
      for (const chat of deletedChats.documents) {
        // Delete messages for this chat
        const messages = await serviceClient.databases.listDocuments(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.chatMessages,
          [Query.equal('chat_id', chat.$id), Query.limit(1000)]
        )
        for (const msg of messages.documents) {
          await serviceClient.databases.deleteDocument(
            APPWRITE_CONFIG.databaseId,
            APPWRITE_CONFIG.collections.chatMessages,
            msg.$id
          )
        }
        
        // Delete the chat
        await serviceClient.databases.deleteDocument(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.chats,
          chat.$id
        )
      }
      
      results.deleted_soft_deleted_chats = deletedChats.documents.length
    } catch (e) {
      console.error("Error cleaning up soft-deleted chats:", e)
      results.deleted_soft_deleted_chats = 0
    }
    
    // 2. Clean up expired rate limits
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const expiredRateLimits = await serviceClient.databases.listDocuments(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.rateLimits,
        [
          Query.lessThan('window_start', oneDayAgo),
          Query.limit(100)
        ]
      )
      
      for (const rateLimit of expiredRateLimits.documents) {
        await serviceClient.databases.deleteDocument(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.rateLimits,
          rateLimit.$id
        )
      }
      
      results.cleaned_rate_limits = expiredRateLimits.documents.length
    } catch (e) {
      console.error("Error cleaning up rate limits:", e)
      results.cleaned_rate_limits = 0
    }
    
    // 3. Clean up expired sessions (if collection exists)
    try {
      const now = new Date().toISOString()
      const expiredSessions = await serviceClient.databases.listDocuments(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.userSessions,
        [
          Query.lessThan('expires_at', now),
          Query.limit(100)
        ]
      )
      
      for (const session of expiredSessions.documents) {
        await serviceClient.databases.deleteDocument(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.userSessions,
          session.$id
        )
      }
      
      results.cleaned_sessions = expiredSessions.documents.length
    } catch {
      results.cleaned_sessions = 0
    }
    
    // 4. Full cleanup: Delete old chats (7+ days)
    if (fullCleanup) {
      try {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        const oldChats = await serviceClient.databases.listDocuments(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.chats,
          [
            Query.isNull('deleted_at'),
            Query.lessThan('created_at', sevenDaysAgo),
            Query.limit(100)
          ]
        )
        
        for (const chat of oldChats.documents) {
          // Delete messages for this chat
          const messages = await serviceClient.databases.listDocuments(
            APPWRITE_CONFIG.databaseId,
            APPWRITE_CONFIG.collections.chatMessages,
            [Query.equal('chat_id', chat.$id), Query.limit(1000)]
          )
          for (const msg of messages.documents) {
            await serviceClient.databases.deleteDocument(
              APPWRITE_CONFIG.databaseId,
              APPWRITE_CONFIG.collections.chatMessages,
              msg.$id
            )
          }
          
          // Delete the chat
          await serviceClient.databases.deleteDocument(
            APPWRITE_CONFIG.databaseId,
            APPWRITE_CONFIG.collections.chats,
            chat.$id
          )
        }
        
        results.deleted_old_chats = oldChats.documents.length
      } catch (e) {
        console.error("Error deleting old chats:", e)
        results.deleted_old_chats = 0
      }
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
