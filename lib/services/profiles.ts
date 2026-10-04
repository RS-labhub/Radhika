import { getSupabaseClient } from "../supabase/client"
import type { ChatProfile } from "../../types/chat"

const MAX_PROFILES_PER_MODE = 3

export async function getProfiles(userId: string): Promise<ChatProfile[]> {
  const { data, error } = await getSupabaseClient()
    .from("chat_profiles")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })

  if (error) throw error
  return (data || []) as ChatProfile[]
}

export async function getProfilesByMode(userId: string, mode: string): Promise<ChatProfile[]> {
  const { data, error } = await getSupabaseClient()
    .from("chat_profiles")
    .select("*")
    .eq("user_id", userId)
    .eq("mode", mode)
    .order("created_at", { ascending: true })

  if (error) throw error
  return (data || []) as ChatProfile[]
}

export async function getProfile(profileId: string): Promise<ChatProfile | null> {
  const { data, error } = await getSupabaseClient()
    .from("chat_profiles")
    .select("*")
    .eq("id", profileId)
    .maybeSingle()

  if (error) {
    if (error.code === "22P02") return null
    throw error
  }
  return (data as ChatProfile | null) ?? null
}

export async function createProfile(
  userId: string,
  mode: string,
  name: string,
  settings?: Record<string, unknown>
): Promise<ChatProfile> {
  const { data, error } = await getSupabaseClient()
    .from("chat_profiles")
    .insert({ user_id: userId, mode, name, settings: settings ?? {} })
    .select()
    .single()

  if (error) throw new Error(error.message || "Failed to create profile")
  return data as ChatProfile
}

export async function updateProfile(
  profileId: string,
  updates: Partial<Pick<ChatProfile, "name" | "settings" | "metadata">>
): Promise<ChatProfile> {
  const updateData: Record<string, unknown> = {}
  if (updates.name !== undefined) updateData.name = updates.name
  if (updates.settings !== undefined) updateData.settings = updates.settings
  if (updates.metadata !== undefined) updateData.metadata = updates.metadata

  const { data, error } = await getSupabaseClient()
    .from("chat_profiles")
    .update(updateData)
    .eq("id", profileId)
    .select()
    .single()

  if (error) throw new Error(error.message || "Failed to update profile")
  return data as ChatProfile
}

export async function renameProfile(profileId: string, newName: string): Promise<ChatProfile> {
  return updateProfile(profileId, { name: newName })
}

export async function deleteProfile(profileId: string): Promise<void> {
  const { error } = await getSupabaseClient().from("chat_profiles").delete().eq("id", profileId)
  if (error) throw new Error(error.message || "Failed to delete profile")
}

export async function getProfileCount(userId: string, mode: string): Promise<number> {
  const profiles = await getProfilesByMode(userId, mode)
  return profiles.length
}

export function canCreateProfile(currentCount: number): boolean {
  return currentCount < MAX_PROFILES_PER_MODE
}
