import { NextRequest } from "next/server"
import type { User } from "@supabase/supabase-js"
import { createServiceRoleClient, getAvatarPublicUrl } from "@/lib/supabase/server"
import { errorResponse, getAuthenticatedUser, successResponse } from "@/lib/api-utils"

type Supabase = ReturnType<typeof createServiceRoleClient>

function getUserName(user: User): string | null {
  const meta = user.user_metadata || {}
  return meta.name || meta.full_name || meta.display_name || null
}

function safeParse(value: string): Record<string, any> {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

async function fetchProfileAndSettings(supabase: Supabase, userId: string) {
  const [profileResult, settingsResult] = await Promise.all([
    supabase.from("users").select("display_name, pet_name, avatar_url, created_at, updated_at").eq("id", userId).maybeSingle(),
    supabase.from("user_settings").select("gender, age, tone, personalization, updated_at").eq("user_id", userId).maybeSingle(),
  ])
  if (profileResult.error) console.error("Error fetching user profile:", profileResult.error.message)
  if (settingsResult.error) console.error("Error fetching user settings:", settingsResult.error.message)
  return { profile: profileResult.data, settings: settingsResult.data }
}

function buildResponse(user: User, profile: any, settings: any) {
  const name = getUserName(user)
  return {
    id: user.id,
    email: user.email,
    name,
    prefs: {},
    profile: profile
      ? {
          display_name: profile.display_name,
          pet_name: profile.pet_name,
          avatar_url: getAvatarPublicUrl(profile.avatar_url),
          created_at: profile.created_at,
          updated_at: profile.updated_at,
        }
      : {
          display_name: name,
          pet_name: null,
          avatar_url: null,
          created_at: null,
          updated_at: null,
        },
    settings: settings
      ? {
          personalization: {
            gender: settings.gender || "other",
            age: settings.age || "teenage",
            tone: settings.tone || "friendly",
            ...(settings.personalization || {}),
          },
          updated_at: settings.updated_at,
        }
      : null,
  }
}

// GET /api/users - Get current user profile with settings
export async function GET() {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return errorResponse("Unauthorized", 401)
    }

    const supabase = createServiceRoleClient()
    const { profile, settings } = await fetchProfileAndSettings(supabase, user.id)

    return successResponse(buildResponse(user, profile, settings))
  } catch (error) {
    console.error("Error getting user:", error)
    return errorResponse("Failed to get user", 500, error)
  }
}

// PATCH /api/users - Update current user profile
export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return errorResponse("Unauthorized", 401)
    }

    const body = await request.json()
    const { name, display_name, pet_name, personalization } = body
    const supabase = createServiceRoleClient()

    let currentUser = user
    if (name !== undefined) {
      const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
        user_metadata: { ...user.user_metadata, name },
      })
      if (error) {
        return errorResponse(`Failed to update name: ${error.message}`, 500, error)
      }
      currentUser = data.user
    }

    const profileRow: Record<string, any> = { id: user.id, email: user.email }
    if (display_name !== undefined) profileRow.display_name = display_name
    if (pet_name !== undefined) profileRow.pet_name = pet_name

    const { error: profileError } = await supabase.from("users").upsert(profileRow, { onConflict: "id" })
    if (profileError) {
      return errorResponse(`Failed to update profile: ${profileError.message}`, 500, profileError)
    }

    if (personalization !== undefined && personalization !== null) {
      const personalizationObj =
        typeof personalization === "string" ? safeParse(personalization) : personalization

      const settingsRow: Record<string, any> = { user_id: user.id, personalization: personalizationObj }
      if (personalizationObj.gender) settingsRow.gender = personalizationObj.gender
      if (personalizationObj.age) settingsRow.age = personalizationObj.age
      if (personalizationObj.tone) settingsRow.tone = personalizationObj.tone

      const { error } = await supabase.from("user_settings").upsert(settingsRow, { onConflict: "user_id" })
      if (error) {
        return errorResponse(`Failed to save personalization: ${error.message}`, 500, error)
      }
    }

    const { profile, settings } = await fetchProfileAndSettings(supabase, user.id)

    return successResponse(buildResponse(currentUser, profile, settings))
  } catch (error) {
    console.error("Error updating user:", error)
    return errorResponse("Failed to update user", 500, error)
  }
}
