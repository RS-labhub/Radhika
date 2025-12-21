import { getSupabaseClient } from "../supabase/client"
import { retryWithReset } from "../supabase/safe"
import type { ChatProfile } from "../../types/database"

const MAX_PROFILES_PER_MODE = 3

export async function getProfiles(userId: string): Promise<ChatProfile[]> {
  const supabase = getSupabaseClient() as any
  const { data, error } = await retryWithReset(
    () => supabase
      .from("chat_profiles")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
    10000
  ) as { data: ChatProfile[] | null; error?: any }

  if (error) throw error
  return data || []
}

export async function getProfilesByMode(userId: string, mode: string): Promise<ChatProfile[]> {
  const supabase = getSupabaseClient() as any
  const { data, error } = await retryWithReset(
    () => supabase
      .from("chat_profiles")
      .select("*")
      .eq("user_id", userId)
      .eq("mode", mode)
      .order("created_at", { ascending: true }),
    10000
  ) as { data: ChatProfile[] | null; error?: any }

  if (error) throw error
  return data || []
}

export async function getProfile(profileId: string): Promise<ChatProfile | null> {
  const supabase = getSupabaseClient() as any
  const { data, error } = await retryWithReset(
    () => supabase
      .from("chat_profiles")
      .select("*")
      .eq("id", profileId)
      .single(),
    10000
  ) as { data: ChatProfile | null; error?: any }

  if (error && error.code !== "PGRST116") throw error
  return data
}

export async function createProfile(
  userId: string,
  mode: string,
  name: string,
  settings?: Record<string, unknown>
): Promise<ChatProfile> {
  const supabase = getSupabaseClient() as any
  
  // Check if user already has max profiles for this mode
  const existingProfiles = await getProfilesByMode(userId, mode)
  if (existingProfiles.length >= MAX_PROFILES_PER_MODE) {
    throw new Error(`Maximum of ${MAX_PROFILES_PER_MODE} profiles per mode allowed`)
  }

  const { data, error } = await retryWithReset(
    () => supabase
      .from("chat_profiles")
      .insert({
        user_id: userId,
        mode,
        name,
        settings: settings || null,
      })
      .select()
      .single(),
    10000
  ) as { data: ChatProfile | null; error?: any }

  if (error) throw error
  if (!data) throw new Error("Failed to create profile")
  return data
}
export async function updateProfile(
  profileId: string,
  updates: Partial<Pick<ChatProfile, "name" | "settings" | "metadata">>
): Promise<ChatProfile> {
  const supabase = getSupabaseClient() as any
  const { data, error } = await retryWithReset(
    () => supabase
      .from("chat_profiles")
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profileId)
      .select()
      .single(),
    10000
  ) as { data: ChatProfile | null; error?: any }

  if (error) throw error
  if (!data) throw new Error("Profile not found")
  return data
}

export async function renameProfile(profileId: string, newName: string): Promise<ChatProfile> {
  return updateProfile(profileId, { name: newName })
}

export async function deleteProfile(profileId: string): Promise<void> {
  const supabase = getSupabaseClient() as any
  const { error } = await retryWithReset(
    () => supabase
      .from("chat_profiles")
      .delete()
      .eq("id", profileId),
    10000
  ) as { error?: any }

  if (error) throw error
}

export async function getProfileCount(userId: string, mode: string): Promise<number> {
  const profiles = await getProfilesByMode(userId, mode)
  return profiles.length
}

export function canCreateProfile(currentCount: number): boolean {
  return currentCount < MAX_PROFILES_PER_MODE
}
