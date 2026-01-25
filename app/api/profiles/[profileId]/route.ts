import { NextRequest, NextResponse } from "next/server"
import { createServerAppwriteClient, createServiceClient } from "../../../../lib/appwrite/server"
import { APPWRITE_CONFIG } from "../../../../lib/appwrite/config"

// Helper to get user from session or x-user-id header
async function getAuthUser(request: NextRequest) {
  const { account } = await createServerAppwriteClient()
  const serviceClient = createServiceClient()
  
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

// GET /api/profiles/[profileId] - Get a specific profile
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ profileId: string }> }
) {
  try {
    const serviceClient = createServiceClient()
    const { profileId } = await params

    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    let profile
    try {
      profile = await serviceClient.databases.getDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.chatProfiles,
        profileId
      )
      
      // Verify ownership
      if (profile.user_id !== user.$id) {
        return NextResponse.json({ error: "Profile not found" }, { status: 404 })
      }
    } catch {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    return NextResponse.json({ profile })
  } catch (error) {
    console.error("Error fetching profile:", error)
    return NextResponse.json(
      { error: "Failed to fetch profile" },
      { status: 500 }
    )
  }
}

// PATCH /api/profiles/[profileId] - Update a profile
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ profileId: string }> }
) {
  try {
    const serviceClient = createServiceClient()
    const { profileId } = await params

    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Verify ownership first using service client
    try {
      const profile = await serviceClient.databases.getDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.chatProfiles,
        profileId
      )
      
      if (profile.user_id !== user.$id) {
        return NextResponse.json({ error: "Profile not found" }, { status: 404 })
      }
    } catch {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const body = await request.json()
    const allowedFields = ["name", "settings", "metadata"]
    const updates: Record<string, unknown> = {}

    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field]
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      )
    }

    updates.updated_at = new Date().toISOString()

    const updatedProfile = await serviceClient.databases.updateDocument(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.chatProfiles,
      profileId,
      updates
    )

    return NextResponse.json({ profile: updatedProfile })
  } catch (error) {
    console.error("Error updating profile:", error)
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    )
  }
}

// DELETE /api/profiles/[profileId] - Delete a profile
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ profileId: string }> }
) {
  try {
    const serviceClient = createServiceClient()
    const { profileId } = await params

    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Verify ownership first using service client
    try {
      const profile = await serviceClient.databases.getDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.chatProfiles,
        profileId
      )
      
      if (profile.user_id !== user.$id) {
        return NextResponse.json({ error: "Profile not found" }, { status: 404 })
      }
    } catch {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    await serviceClient.databases.deleteDocument(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.chatProfiles,
      profileId
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting profile:", error)
    return NextResponse.json(
      { error: "Failed to delete profile" },
      { status: 500 }
    )
  }
}
