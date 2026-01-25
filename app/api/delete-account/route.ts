import { NextRequest, NextResponse } from "next/server"
import { createServerAppwriteClient, createServiceClient, Query } from "../../../lib/appwrite/server"
import { APPWRITE_CONFIG } from "../../../lib/appwrite/config"

export async function POST(request: NextRequest) {
  try {
    const { account } = await createServerAppwriteClient()
    const serviceClient = createServiceClient()
    
    let user
    try {
      user = await account.get()
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = user.$id

    // 1) Delete favorites for this user
    try {
      const favorites = await serviceClient.databases.listDocuments(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.favorites,
        [Query.equal('user_id', userId), Query.limit(1000)]
      )
      for (const fav of favorites.documents) {
        await serviceClient.databases.deleteDocument(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.favorites,
          fav.$id
        )
      }
    } catch (err) {
      console.warn("Failed to delete favorites:", err)
    }

    // 2) Delete chat messages and chats
    try {
      const chats = await serviceClient.databases.listDocuments(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.chats,
        [Query.equal('user_id', userId), Query.limit(1000)]
      )
      
      for (const chat of chats.documents) {
        // Delete messages for this chat
        try {
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
        } catch (e) {
          console.warn("Failed to delete messages for chat:", chat.$id, e)
        }
        
        // Delete the chat
        await serviceClient.databases.deleteDocument(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.chats,
          chat.$id
        )
      }
    } catch (err) {
      console.warn("Failed to delete chats/messages:", err)
    }

    // 3) Delete chat profiles
    try {
      const profiles = await serviceClient.databases.listDocuments(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.chatProfiles,
        [Query.equal('user_id', userId), Query.limit(100)]
      )
      for (const profile of profiles.documents) {
        await serviceClient.databases.deleteDocument(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.chatProfiles,
          profile.$id
        )
      }
    } catch (err) {
      console.warn("Failed to delete chat_profiles:", err)
    }

    // 4) Delete user settings
    try {
      const settings = await serviceClient.databases.listDocuments(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.userSettings,
        [Query.equal('user_id', userId)]
      )
      for (const setting of settings.documents) {
        await serviceClient.databases.deleteDocument(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.userSettings,
          setting.$id
        )
      }
    } catch (err) {
      console.warn("Failed to delete user_settings:", err)
    }

    // 5) Delete the user document
    try {
      await serviceClient.databases.deleteDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.users,
        userId
      )
    } catch (err) {
      console.warn("Failed to delete users row:", err)
    }

    // 6) Delete the Appwrite auth user
    try {
      await serviceClient.users.delete(userId)
    } catch (err) {
      console.error("Failed to delete auth user:", err)
      // Continue - we've removed app data; admin deletion may fail
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("Error deleting account:", err)
    return NextResponse.json({ error: "Failed to delete account" }, { status: 500 })
  }
}
