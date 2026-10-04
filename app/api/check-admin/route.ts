import { successResponse, getAuthenticatedUser, isReservedEmail } from "@/lib/api-utils"

// GET /api/check-admin - Check if current user is an admin (in reserved_emails)
export async function GET() {
  try {
    const user = await getAuthenticatedUser()

    if (!user) {
      return successResponse({ isAdmin: false })
    }

    return successResponse({ isAdmin: await isReservedEmail(user.email) })
  } catch (error) {
    console.error("Error checking admin status:", error)
    return successResponse({ isAdmin: false })
  }
}
