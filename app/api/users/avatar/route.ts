import { NextRequest } from "next/server"
import { createServerAppwriteClient, createServiceClient, ID, Permission, Role } from "@/lib/appwrite/server"
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

// POST /api/users/avatar - Upload avatar
export async function POST(request: NextRequest) {
  try {
    const { account } = await createServerAppwriteClient()
    const serviceClient = createServiceClient()

    const user = await getUser(request, account, serviceClient)
    if (!user) {
      return errorResponse("Unauthorized", 401)
    }

    const formData = await request.formData()
    // Accept both 'file' and 'avatar' field names
    const file = (formData.get('file') || formData.get('avatar')) as File | null

    if (!file) {
      return errorResponse("No file provided", 400)
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return errorResponse("Invalid file type. Please upload an image.", 400)
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      return errorResponse("File too large. Max size is 2MB.", 400)
    }

    // Delete old avatar if exists
    try {
      const oldPrefs = user.prefs as Record<string, unknown> | undefined
      if (oldPrefs?.avatar_file_id && typeof oldPrefs.avatar_file_id === 'string') {
        await serviceClient.storage.deleteFile(
          APPWRITE_CONFIG.buckets.avatars,
          oldPrefs.avatar_file_id
        )
      }
    } catch (e) {
      // Ignore - old file might not exist
      console.log("Could not delete old avatar:", e)
    }

    // Convert File to Buffer for Appwrite
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    
    // Create a File object that Appwrite expects
    const { InputFile } = await import('node-appwrite/file')
    const inputFile = InputFile.fromBuffer(buffer, file.name)

    // Upload new avatar with permissions that allow public read
    const fileId = ID.unique()
    const uploadedFile = await serviceClient.storage.createFile(
      APPWRITE_CONFIG.buckets.avatars,
      fileId,
      inputFile,
      [
        Permission.read(Role.any()), // Allow public read
        Permission.write(Role.user(user.$id)), // Only owner can write
        Permission.delete(Role.user(user.$id)), // Only owner can delete
      ]
    )

    // Build the URL for the avatar
    const avatarUrl = `${APPWRITE_CONFIG.endpoint}/storage/buckets/${APPWRITE_CONFIG.buckets.avatars}/files/${uploadedFile.$id}/view?project=${APPWRITE_CONFIG.projectId}`

    // Update user preferences with the new avatar URL and file ID
    await serviceClient.users.updatePrefs(user.$id, {
      ...((user.prefs as object) || {}),
      avatar_url: avatarUrl,
      avatar_file_id: uploadedFile.$id,
    })

    // Also update the users collection in the database
    try {
      await serviceClient.databases.updateDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.users,
        user.$id,
        { avatar_url: avatarUrl }
      )
      console.log("Updated users collection with avatar_url:", avatarUrl)
    } catch (e: any) {
      // Document might not exist yet, try creating it
      console.log("Could not update users collection, trying to create:", e?.message)
      try {
        await serviceClient.databases.createDocument(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.users,
          user.$id,
          { 
            avatar_url: avatarUrl,
            display_name: user.name || user.email?.split('@')[0] || null,
            email_verified: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        )
        console.log("Created users collection document with avatar_url:", avatarUrl)
      } catch (createError: any) {
        console.error("Failed to create users document:", createError?.message)
      }
    }

    return successResponse({
      url: avatarUrl,
      avatarUrl: avatarUrl,
      fileId: uploadedFile.$id,
    })
  } catch (error: any) {
    console.error("Error uploading avatar:", error)
    return errorResponse(
      error.message || "Failed to upload avatar",
      error.code === 404 ? 404 : 500,
      error
    )
  }
}

// DELETE /api/users/avatar - Delete avatar
export async function DELETE(request: NextRequest) {
  try {
    const { account } = await createServerAppwriteClient()
    const serviceClient = createServiceClient()

    const user = await getUser(request, account, serviceClient)
    if (!user) {
      return errorResponse("Unauthorized", 401)
    }

    const prefs = user.prefs as Record<string, unknown> | undefined
    if (prefs?.avatar_file_id && typeof prefs.avatar_file_id === 'string') {
      // Delete the file from storage
      try {
        await serviceClient.storage.deleteFile(
          APPWRITE_CONFIG.buckets.avatars,
          prefs.avatar_file_id
        )
      } catch (e) {
        console.log("Could not delete avatar file:", e)
      }

      // Clear avatar from preferences
      const { avatar_url, avatar_file_id, ...restPrefs } = prefs
      await serviceClient.users.updatePrefs(user.$id, restPrefs)
    }

    return successResponse({ success: true })
  } catch (error: any) {
    console.error("Error deleting avatar:", error)
    return errorResponse("Failed to delete avatar", 500, error)
  }
}
