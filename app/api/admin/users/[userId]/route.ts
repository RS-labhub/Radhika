import { NextRequest } from "next/server"
import { createServerAppwriteClient, createServiceClient, Query } from "@/lib/appwrite/server"
import { APPWRITE_CONFIG } from "@/lib/appwrite/config"
import { errorResponse, successResponse } from "@/lib/api-utils"

// Helper to verify admin access (user must be in reserved_emails)
async function verifyAdminAccess(request: NextRequest): Promise<{ user: any; isAdmin: boolean }> {
  const { account } = await createServerAppwriteClient()
  const serviceClient = createServiceClient()

  let user: any = null
  try {
    user = await account.get()
  } catch (error: any) {
    const userIdHeader = request.headers.get('x-user-id')
    if (userIdHeader) {
      try {
        user = await serviceClient.users.get(userIdHeader)
      } catch {
        return { user: null, isAdmin: false }
      }
    }
  }

  if (!user) {
    return { user: null, isAdmin: false }
  }

  // Check if user email is in reserved_emails collection
  try {
    const reservedEmails = await serviceClient.databases.listDocuments(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.reservedEmails,
      [Query.equal("email", user.email)]
    )
    return { user, isAdmin: reservedEmails.documents.length > 0 }
  } catch {
    return { user, isAdmin: false }
  }
}

// GET /api/admin/users/[userId] - Get user details with all chats
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { user, isAdmin } = await verifyAdminAccess(request)
    
    if (!user) {
      return errorResponse("Unauthorized", 401)
    }
    
    if (!isAdmin) {
      return errorResponse("Forbidden - Admin access required", 403)
    }

    const { userId } = await params
    const serviceClient = createServiceClient()

    // Get user
    const targetUser = await serviceClient.users.get(userId)

    // Get user profile
    let profile = null
    try {
      profile = await serviceClient.databases.getDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.users,
        userId
      )
    } catch {
      // Profile might not exist
    }

    // Get user's chats
    const chatsResponse = await serviceClient.databases.listDocuments(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.chats,
      [
        Query.equal("user_id", userId),
        Query.orderDesc("last_message_at"),
        Query.limit(100)
      ]
    )

    const chats = chatsResponse.documents.map((chat: any) => ({
      id: chat.$id,
      mode: chat.mode,
      title: chat.title,
      messageCount: chat.message_count || 0,
      lastMessagePreview: chat.last_message_preview,
      createdAt: chat.created_at || chat.$createdAt,
      lastMessageAt: chat.last_message_at,
      isArchived: chat.is_archived || false
    }))

    return successResponse({
      user: {
        id: targetUser.$id,
        email: targetUser.email,
        name: targetUser.name,
        labels: targetUser.labels || [],
        createdAt: targetUser.$createdAt,
        lastActivity: targetUser.accessedAt || targetUser.$updatedAt,
        profile: profile ? {
          display_name: profile.display_name,
          avatar_url: profile.avatar_url,
          is_creator: profile.is_creator,
          pet_name: profile.pet_name
        } : null
      },
      chats,
      totalChats: chatsResponse.total
    })
  } catch (error: any) {
    console.error("Error fetching user details:", error)
    return errorResponse("Failed to fetch user details", 500)
  }
}

// DELETE /api/admin/users/[userId] - Delete a user and all their data
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { user, isAdmin } = await verifyAdminAccess(request)
    
    if (!user) {
      return errorResponse("Unauthorized", 401)
    }
    
    if (!isAdmin) {
      return errorResponse("Forbidden - Admin access required", 403)
    }

    const { userId } = await params
    const serviceClient = createServiceClient()

    // Prevent self-deletion
    if (userId === user.$id) {
      return errorResponse("Cannot delete your own account", 400)
    }

    // Delete all messages for user's chats
    const chatsResponse = await serviceClient.databases.listDocuments(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.chats,
      [Query.equal("user_id", userId), Query.limit(1000)]
    )

    for (const chat of chatsResponse.documents) {
      // Delete messages
      const messagesResponse = await serviceClient.databases.listDocuments(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.chatMessages,
        [Query.equal("chat_id", chat.$id), Query.limit(1000)]
      )
      
      for (const message of messagesResponse.documents) {
        await serviceClient.databases.deleteDocument(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.chatMessages,
          message.$id
        )
      }

      // Delete chat
      await serviceClient.databases.deleteDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.chats,
        chat.$id
      )
    }

    // Delete user profile
    try {
      await serviceClient.databases.deleteDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.users,
        userId
      )
    } catch {
      // Profile might not exist
    }

    // Delete user settings
    try {
      const settingsResponse = await serviceClient.databases.listDocuments(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.userSettings,
        [Query.equal("user_id", userId), Query.limit(1)]
      )
      for (const setting of settingsResponse.documents) {
        await serviceClient.databases.deleteDocument(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.userSettings,
          setting.$id
        )
      }
    } catch {
      // Settings might not exist
    }

    // Delete favorites
    try {
      const favoritesResponse = await serviceClient.databases.listDocuments(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.favorites,
        [Query.equal("user_id", userId), Query.limit(1000)]
      )
      for (const favorite of favoritesResponse.documents) {
        await serviceClient.databases.deleteDocument(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.favorites,
          favorite.$id
        )
      }
    } catch {
      // Favorites might not exist
    }

    // Finally, delete the user from Appwrite auth
    await serviceClient.users.delete(userId)

    return successResponse({ message: "User deleted successfully" })
  } catch (error: any) {
    console.error("Error deleting user:", error)
    return errorResponse("Failed to delete user", 500)
  }
}

// PATCH /api/admin/users/[userId] - Update user profile (admin can modify avatar, settings)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { user, isAdmin } = await verifyAdminAccess(request)
    
    if (!user) {
      return errorResponse("Unauthorized", 401)
    }
    
    if (!isAdmin) {
      return errorResponse("Forbidden - Admin access required", 403)
    }

    const { userId } = await params
    const body = await request.json()
    const serviceClient = createServiceClient()

    // Get target user to verify they exist
    const targetUser = await serviceClient.users.get(userId)
    if (!targetUser) {
      return errorResponse("User not found", 404)
    }

    // Handle avatar deletion
    if (body.deleteAvatar === true) {
      // Get current avatar file ID from user prefs
      const prefs = targetUser.prefs as Record<string, unknown> | undefined
      const avatarFileId = prefs?.avatar_file_id as string | undefined

      // Delete the file from storage if it exists
      if (avatarFileId) {
        try {
          await serviceClient.storage.deleteFile(
            APPWRITE_CONFIG.buckets.avatars,
            avatarFileId
          )
          console.log("Admin: Deleted avatar file:", avatarFileId)
        } catch (e) {
          console.log("Admin: Could not delete avatar file:", e)
        }
      }

      // Clear avatar from user prefs
      const { avatar_url, avatar_file_id, ...restPrefs } = (prefs || {}) as Record<string, unknown>
      await serviceClient.users.updatePrefs(userId, restPrefs)

      // Clear avatar from users collection
      try {
        await serviceClient.databases.updateDocument(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.users,
          userId,
          { avatar_url: null }
        )
      } catch (e) {
        console.log("Admin: Could not update users collection:", e)
      }
    }

    // Handle profile updates
    const profileUpdates: Record<string, any> = {}
    if (body.display_name !== undefined) {
      profileUpdates.display_name = body.display_name
    }
    if (body.pet_name !== undefined) {
      profileUpdates.pet_name = body.pet_name
    }
    if (body.is_creator !== undefined) {
      profileUpdates.is_creator = body.is_creator
    }

    if (Object.keys(profileUpdates).length > 0) {
      profileUpdates.updated_at = new Date().toISOString()
      
      try {
        await serviceClient.databases.updateDocument(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.users,
          userId,
          profileUpdates
        )
      } catch (e) {
        // Document might not exist, try creating
        try {
          await serviceClient.databases.createDocument(
            APPWRITE_CONFIG.databaseId,
            APPWRITE_CONFIG.collections.users,
            userId,
            {
              ...profileUpdates,
              created_at: new Date().toISOString()
            }
          )
        } catch (createError) {
          console.error("Admin: Failed to create/update user profile:", createError)
        }
      }
    }

    // Fetch updated user data
    const updatedUser = await serviceClient.users.get(userId)
    let profile = null
    try {
      profile = await serviceClient.databases.getDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.users,
        userId
      )
    } catch {
      // Profile might not exist
    }

    return successResponse({
      message: "User updated successfully",
      user: {
        id: updatedUser.$id,
        email: updatedUser.email,
        name: updatedUser.name,
        profile: profile ? {
          display_name: profile.display_name,
          avatar_url: profile.avatar_url,
          pet_name: profile.pet_name,
          is_creator: profile.is_creator
        } : null
      }
    })
  } catch (error: any) {
    console.error("Error updating user:", error)
    return errorResponse("Failed to update user", 500)
  }
}