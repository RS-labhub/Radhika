import { NextRequest } from "next/server"
import { createServerAppwriteClient, createServiceClient, Query } from "@/lib/appwrite/server"
import { APPWRITE_CONFIG } from "@/lib/appwrite/config"
import { errorResponse, successResponse } from "@/lib/api-utils"

// Helper to get user from session or header
async function getUser(request: NextRequest, account: any, serviceClient: any) {
  try {
    return await account.get()
  } catch (error: any) {
    // Try to get user ID from header as fallback
    const userIdHeader = request.headers.get('x-user-id')
    if (userIdHeader) {
      try {
        return await serviceClient.users.get(userIdHeader)
      } catch {
        return null
      }
    }
    return null
  }
}

// GET /api/check-admin - Check if current user is an admin (in reserved_emails)
export async function GET(request: NextRequest) {
  try {
    const { account } = await createServerAppwriteClient()
    const serviceClient = createServiceClient()

    const user = await getUser(request, account, serviceClient)
    
    if (!user) {
      console.log("[CheckAdmin] No user found")
      return successResponse({ isAdmin: false })
    }

    console.log("[CheckAdmin] Checking admin status for:", user.email)

    // Check if user email is in reserved_emails collection
    try {
      const reservedEmails = await serviceClient.databases.listDocuments(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.reservedEmails,
        [Query.equal("email", user.email)]
      )
      const isAdmin = reservedEmails.documents.length > 0
      console.log("[CheckAdmin] Result:", { email: user.email, isAdmin, found: reservedEmails.documents.length })
      return successResponse({ isAdmin })
    } catch (error: any) {
      console.error("[CheckAdmin] Error checking reserved emails:", error?.message)
      return successResponse({ isAdmin: false })
    }
  } catch (error) {
    console.error("Error checking admin status:", error)
    return successResponse({ isAdmin: false })
  }
}
