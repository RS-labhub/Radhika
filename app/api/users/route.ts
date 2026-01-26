import { NextRequest, NextResponse } from "next/server"
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

// GET /api/users - Get current user profile with database document
export async function GET(request: NextRequest) {
  try {
    const { account } = await createServerAppwriteClient()
    const serviceClient = createServiceClient()

    const user = await getUser(request, account, serviceClient)
    if (!user) {
      return errorResponse("Unauthorized", 401)
    }

    // Get user profile from users collection using service client
    let userProfile = null
    try {
      userProfile = await serviceClient.databases.getDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.users,
        user.$id
      )
      console.log("User profile found:", { 
        id: userProfile.$id, 
        display_name: userProfile.display_name,
        avatar_url: userProfile.avatar_url 
      })
    } catch (e: any) {
      // User document might not exist yet
      console.log("User profile not found for user:", user.$id, e?.message)
    }

    // Get user settings/personalization
    let userSettings = null
    try {
      const settingsResponse = await serviceClient.databases.listDocuments(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.userSettings,
        [Query.equal("user_id", user.$id), Query.limit(1)]
      )
      if (settingsResponse.documents.length > 0) {
        userSettings = settingsResponse.documents[0]
      }
    } catch (e: any) {
      console.log("User settings not found")
    }

    // Get avatar_url from profile or fallback to user prefs
    const prefs = user.prefs as Record<string, unknown> | undefined
    console.log("[API/users] User prefs:", prefs)
    console.log("[API/users] Profile avatar_url:", userProfile?.avatar_url)
    console.log("[API/users] Prefs avatar_url:", prefs?.avatar_url)
    
    let avatarUrl = userProfile?.avatar_url || (prefs?.avatar_url as string | undefined) || null
    console.log("[API/users] Selected avatar_url:", avatarUrl)
    
    // Ensure avatar_url is a full URL, not just a file ID
    if (avatarUrl && !avatarUrl.startsWith('http://') && !avatarUrl.startsWith('https://')) {
      // It's a file ID, convert to full URL
      avatarUrl = `${APPWRITE_CONFIG.endpoint}/storage/buckets/${APPWRITE_CONFIG.buckets.avatars}/files/${avatarUrl}/view?project=${APPWRITE_CONFIG.projectId}`
      console.log("[API/users] Converted avatar file ID to full URL:", avatarUrl)
    }

    // Return combined user data
    return successResponse({
      id: user.$id,
      email: user.email,
      name: user.name,
      prefs: user.prefs || {},
      profile: userProfile ? {
        display_name: userProfile.display_name,
        pet_name: userProfile.pet_name,
        avatar_url: avatarUrl,
        created_at: userProfile.created_at,
        updated_at: userProfile.updated_at
      } : {
        // Return a profile object even if no document exists, using prefs as fallback
        display_name: user.name || null,
        pet_name: null,
        avatar_url: avatarUrl,
        created_at: null,
        updated_at: null
      },
      settings: userSettings ? {
        // Include individual fields for personalization
        personalization: {
          gender: userSettings.gender || 'other',
          age: userSettings.age || 'teenage',
          tone: userSettings.tone || 'friendly',
          // Also parse the JSON personalization if it exists for backwards compatibility
          ...(userSettings.personalization ? (typeof userSettings.personalization === 'string' 
            ? (() => { try { return JSON.parse(userSettings.personalization) } catch { return {} } })()
            : userSettings.personalization
          ) : {})
        },
        updated_at: userSettings.updated_at
      } : null
    })
  } catch (error) {
    console.error("Error getting user:", error)
    return errorResponse("Failed to get user", 500, error)
  }
}

// PATCH /api/users - Update current user profile
export async function PATCH(request: NextRequest) {
  try {
    const { account } = await createServerAppwriteClient()
    const serviceClient = createServiceClient()

    const user = await getUser(request, account, serviceClient)
    if (!user) {
      console.log("PATCH /api/users: No user found")
      return errorResponse("Unauthorized", 401)
    }
    
    console.log("PATCH /api/users: User found:", user.$id)

    const body = await request.json()
    const { name, display_name, pet_name, personalization } = body
    
    console.log("PATCH /api/users: Request body:", { name, display_name, pet_name, personalization: personalization ? 'present' : 'absent' })

    // Update auth user name if provided
    if (name !== undefined) {
      await serviceClient.users.updateName(user.$id, name)
    }

    // Update profile in users collection if display_name or pet_name provided
    if (display_name !== undefined || pet_name !== undefined) {
      const updateData: Record<string, any> = {
        updated_at: new Date().toISOString()
      }
      if (display_name !== undefined) updateData.display_name = display_name
      if (pet_name !== undefined) updateData.pet_name = pet_name

      try {
        await serviceClient.databases.updateDocument(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.users,
          user.$id,
          updateData
        )
      } catch (e: any) {
        // Document might not exist, try to create it
        if (e.code === 404) {
          console.log("User profile document not found, creating new one for user:", user.$id)
          await serviceClient.databases.createDocument(
            APPWRITE_CONFIG.databaseId,
            APPWRITE_CONFIG.collections.users,
            user.$id,
            {
              email: user.email, // Required field
              display_name: display_name || '',
              pet_name: pet_name || null,
              role: 'authenticated',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }
          )
        } else {
          console.error("Error updating user profile:", e)
          throw e
        }
      }
    }

    // Update personalization in user_settings collection if provided
    if (personalization !== undefined) {
      try {
        // Extract personalization fields (gender, age, tone) as individual fields
        const updateData: Record<string, any> = {
          updated_at: new Date().toISOString()
        }
        
        // If personalization is an object with gender/age/tone, update those fields
        if (personalization.gender) updateData.gender = personalization.gender
        if (personalization.age) updateData.age = personalization.age
        if (personalization.tone) updateData.tone = personalization.tone
        
        // Store the full personalization as JSON string if the field exists
        try {
          const serializedPersonalization = typeof personalization === 'string' 
            ? personalization 
            : JSON.stringify(personalization)
          updateData.personalization = serializedPersonalization
        } catch (e) {
          console.warn("Could not serialize personalization, using individual fields only")
        }
        
        console.log("Saving personalization:", updateData)

        // Check if settings exist
        const existingSettings = await serviceClient.databases.listDocuments(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.userSettings,
          [Query.equal("user_id", user.$id), Query.limit(1)]
        )

        if (existingSettings.documents.length > 0) {
          // Update existing - first try with all fields, then without problematic ones
          try {
            await serviceClient.databases.updateDocument(
              APPWRITE_CONFIG.databaseId,
              APPWRITE_CONFIG.collections.userSettings,
              existingSettings.documents[0].$id,
              updateData
            )
          } catch (e: any) {
            // If personalization field doesn't exist, try without it
            if (e.message?.includes('personalization')) {
              delete updateData.personalization
              await serviceClient.databases.updateDocument(
                APPWRITE_CONFIG.databaseId,
                APPWRITE_CONFIG.collections.userSettings,
                existingSettings.documents[0].$id,
                updateData
              )
            } else {
              throw e
            }
          }
        } else {
          // Create new - need to generate unique ID
          const { ID } = await import('node-appwrite')
          const createData: Record<string, any> = {
            user_id: user.$id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
          if (personalization.gender) createData.gender = personalization.gender
          if (personalization.age) createData.age = personalization.age
          if (personalization.tone) createData.tone = personalization.tone
          
          try {
            createData.personalization = typeof personalization === 'string' 
              ? personalization 
              : JSON.stringify(personalization)
          } catch (e) {
            // Ignore
          }
          
          console.log("Creating new user settings:", createData)
          
          try {
            await serviceClient.databases.createDocument(
              APPWRITE_CONFIG.databaseId,
              APPWRITE_CONFIG.collections.userSettings,
              ID.unique(),
              createData
            )
          } catch (e: any) {
            // If personalization or tone fields don't exist, try without them
            if (e.message?.includes('personalization') || e.message?.includes('tone')) {
              delete createData.personalization
              delete createData.tone
              await serviceClient.databases.createDocument(
                APPWRITE_CONFIG.databaseId,
                APPWRITE_CONFIG.collections.userSettings,
                ID.unique(),
                createData
              )
            } else {
              throw e
            }
          }
        }
      } catch (e: any) {
        console.error("Error updating personalization:", e)
        // Return specific error message
        return errorResponse(`Failed to save personalization: ${e.message || e.type || 'Unknown error'}`, 500, e)
      }
    }

    // Return updated user
    const updatedUser = await serviceClient.users.get(user.$id)
    
    // Also fetch updated profile
    let userProfile = null
    try {
      userProfile = await serviceClient.databases.getDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.users,
        user.$id
      )
    } catch (e) {
      // Profile might not exist
    }

    // Fetch updated settings
    let userSettings = null
    try {
      const settingsResponse = await serviceClient.databases.listDocuments(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.userSettings,
        [Query.equal("user_id", user.$id), Query.limit(1)]
      )
      if (settingsResponse.documents.length > 0) {
        userSettings = settingsResponse.documents[0]
      }
    } catch (e) {
      // Settings might not exist
    }

    return successResponse({
      id: updatedUser.$id,
      email: updatedUser.email,
      name: updatedUser.name,
      prefs: updatedUser.prefs || {},
      profile: userProfile ? {
        display_name: userProfile.display_name,
        pet_name: userProfile.pet_name,
        avatar_url: userProfile.avatar_url
      } : null,
      settings: userSettings ? {
        personalization: userSettings.personalization
      } : null
    })
  } catch (error) {
    console.error("Error updating user:", error)
    return errorResponse("Failed to update user", 500, error)
  }
}
