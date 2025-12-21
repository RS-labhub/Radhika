import { getSupabaseClient } from "@/lib/supabase/client"
import { retryWithReset } from "@/lib/supabase/safe"
import type { ChatProfile, Mode } from "@/types/chat"

export class ProfileService {
  private get supabase() {
    return getSupabaseClient() as any
  }

  // ============ Profiles ============
  async createProfile(mode: Mode, name: string, settings?: Record<string, any>, metadata?: Record<string, any>) {
    const { data, error } = await retryWithReset(
      () => this.supabase
        .from("chat_profiles")
        .insert({
          mode,
          name,
          settings,
          metadata,
        } as any)
        .select()
        .single(),
      10000
    ) as any

    if (error) {
      // Check if it's the profile limit trigger
      if (error.message.includes("Maximum of 3 profiles")) {
        throw new Error("You can only create up to 3 profiles per mode")
      }
      throw error
    }
    return data as ChatProfile
  }

  async getProfiles(mode?: Mode) {
    let query = this.supabase
      .from("chat_profiles")
      .select("*")
      .order("created_at", { ascending: true })

    if (mode) query = query.eq("mode", mode)

    const { data, error } = await retryWithReset(
      () => query,
      10000
    ) as any
    if (error) throw error
    return (data as ChatProfile[]) || []
  }

  async getProfileById(profileId: string) {
    const { data, error } = await retryWithReset(
      () => this.supabase
        .from("chat_profiles")
        .select("*")
        .eq("id", profileId)
        .single(),
      10000
    ) as any

    if (error) throw error
    return data as ChatProfile
  }

  async updateProfile(profileId: string, updates: Partial<ChatProfile>) {
    const { data, error } = await retryWithReset(
      () => this.supabase
        .from("chat_profiles")
        .update(updates as any)
        .eq("id", profileId)
        .select()
        .single(),
      10000
    ) as any

    if (error) throw error
    return data as ChatProfile
  }

  async renameProfile(profileId: string, name: string) {
    return this.updateProfile(profileId, { name })
  }

  async deleteProfile(profileId: string) {
    const { error } = await retryWithReset(
      () => this.supabase
        .from("chat_profiles")
        .delete()
        .eq("id", profileId),
      10000
    ) as any

    if (error) throw error
  }

  async countProfilesForMode(mode: Mode) {
    const { count, error } = await retryWithReset(
      () => this.supabase
        .from("chat_profiles")
        .select("*", { count: "exact", head: true })
        .eq("mode", mode),
      10000
    ) as any

    if (error) throw error
    return count || 0
  }
}

// Export singleton instance
export const profileService = new ProfileService()
