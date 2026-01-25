import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/appwrite/server"
import { APPWRITE_CONFIG } from "@/lib/appwrite/config"
import { ID, Permission, Role } from "node-appwrite"

/**
 * POST /api/users/init
 * Initialize user profile and settings after signup/first login
 * This uses the service client with API key to bypass permission requirements
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, email, displayName } = body

    if (!userId || !email) {
      return NextResponse.json(
        { error: "userId and email are required" },
        { status: 400 }
      )
    }

    const { databases } = createServiceClient()

    // Create user profile with document-level permissions
    try {
      await databases.createDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.users,
        userId, // Use the user's ID from Appwrite Auth
        {
          email,
          display_name: displayName || null,
          role: "authenticated",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        [
          Permission.read(Role.user(userId)),
          Permission.update(Role.user(userId)),
          Permission.delete(Role.user(userId)),
        ]
      )
    } catch (err: any) {
      // If document already exists (409), that's fine
      if (err.code !== 409) {
        throw err
      }
    }

    // Create user settings with document-level permissions
    try {
      await databases.createDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.userSettings,
        ID.unique(),
        {
          user_id: userId,
          theme: "system",
          language: "en",
          voice_enabled: false,
          selected_chat_mode: "general",
          ui_style: "modern",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        [
          Permission.read(Role.user(userId)),
          Permission.update(Role.user(userId)),
          Permission.delete(Role.user(userId)),
        ]
      )
    } catch (err: any) {
      // If settings already exist, that's fine
      console.error("Settings creation error:", err)
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error initializing user:", error)
    return NextResponse.json(
      { error: error.message || "Failed to initialize user" },
      { status: 500 }
    )
  }
}
