"use client"

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react"
import { getSupabaseClient } from "../lib/supabase/client"
import type { User as SupabaseUser, Session } from "@supabase/supabase-js"
import type { User, UserSettings, UserRole } from "@/types/database"

interface AuthState {
  user: SupabaseUser | null
  session: Session | null
  profile: User | null
  settings: UserSettings | null
  isLoading: boolean
  isAuthenticated: boolean
  role: UserRole
}

interface AuthContextType extends AuthState {
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error: Error | null }>
  signIn: (email: string, password: string, remember?: boolean) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<{ error: Error | null }>
  updatePassword: (password: string) => Promise<{ error: Error | null }>
  refreshProfile: () => Promise<void>
  refreshSettings: () => Promise<void>
  updateSettings: (settings: Partial<UserSettings>) => Promise<{ error: Error | null }>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    profile: null,
    settings: null,
    isLoading: true,
    isAuthenticated: false,
    role: "guest",
  })

  const supabase = getSupabaseClient() as any

  const fetchProfile = useCallback(async (userId: string) => {
    const { data: profile } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single()
    
    // Resolve avatar_url if it's a storage path
    if (profile && profile.avatar_url && !profile.avatar_url.startsWith("http")) {
      try {
        const { data: signedData } = await supabase.storage
          .from("avatars")
          .createSignedUrl(profile.avatar_url, 60 * 60 * 24 * 365) // 1 year
        
        if (signedData?.signedUrl) {
          profile.avatar_url = signedData.signedUrl
        } else {
          // Fallback to public URL
          const { data: publicData } = supabase.storage
            .from("avatars")
            .getPublicUrl(profile.avatar_url)
          
          if (publicData?.publicUrl) {
            profile.avatar_url = publicData.publicUrl
          }
        }
      } catch (error) {
        console.error("Failed to resolve avatar URL:", error)
      }
    }
    
    return profile
  }, [supabase])

  const fetchSettings = useCallback(async (userId: string) => {
    const { data: settings } = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", userId)
      .single()
    return settings
  }, [supabase])

  const refreshProfile = useCallback(async () => {
    if (state.user) {
      const profile = await fetchProfile(state.user.id)
      setState(prev => ({ 
        ...prev, 
        profile, 
        role: profile?.role || "authenticated" 
      }))
    }
  }, [state.user, fetchProfile])

  const refreshSettings = useCallback(async () => {
    if (state.user) {
      const settings = await fetchSettings(state.user.id)
      setState(prev => ({ ...prev, settings }))
    }
  }, [state.user, fetchSettings])

  useEffect(() => {
    // Get initial session
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        
        if (session?.user) {
          let profile = await fetchProfile(session.user.id)
          let settings = await fetchSettings(session.user.id)

          // If profile doesn't exist (e.g. signUp with email confirmation required), create it
          if (!profile) {
            try {
              const displayName = (session.user.user_metadata as any)?.display_name || null
              const { data: insertData, error: insertError } = await supabase
                .from("users")
                .insert({
                  id: session.user.id,
                  email: session.user.email || "",
                  display_name: displayName,
                  role: "authenticated",
                })
                .select()

              if (!insertError && insertData && insertData.length) {
                profile = insertData[0]
              }
            } catch (err) {
              console.error("Failed to create profile on sign in:", err)
            }
          }

          // If settings don't exist, create a defaults row
          if (!settings) {
            try {
              const { data: insertSettings, error: insertSettingsError } = await supabase
                .from("user_settings")
                .insert({
                  user_id: session.user.id,
                  theme: "system",
                  language: "en",
                  voice_enabled: false,
                  selected_chat_mode: "general",
                  ui_style: "modern",
                })
                .select()

              if (!insertSettingsError && insertSettings && insertSettings.length) {
                settings = insertSettings[0]
              }
            } catch (err) {
              console.error("Failed to create default settings on sign in:", err)
            }
          }

          // Update last login if profile exists
          try {
            await supabase
              .from("users")
              .update({ last_login_at: new Date().toISOString() })
              .eq("id", session.user.id)
          } catch (err) {
            // Non-fatal
          }

          setState({
            user: session.user,
            session,
            profile,
            settings,
            isLoading: false,
            isAuthenticated: true,
            role: profile?.role || "authenticated",
          })
        } else {
          setState({
            user: null,
            session: null,
            profile: null,
            settings: null,
            isLoading: false,
            isAuthenticated: false,
            role: "guest",
          })
        }
      } catch (error) {
        console.error("Auth init error:", error)
        setState(prev => ({ ...prev, isLoading: false }))
      }
    }

    initAuth()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: string, session: Session | null) => {
        if (event === "SIGNED_IN" && session?.user) {
          let profile = await fetchProfile(session.user.id)
          let settings = await fetchSettings(session.user.id)

          if (!profile) {
            try {
              const displayName = (session.user.user_metadata as any)?.display_name || null
              const { data: insertData, error: insertError } = await supabase
                .from("users")
                .insert({
                  id: session.user.id,
                  email: session.user.email || "",
                  display_name: displayName,
                  role: "authenticated",
                })
                .select()

              if (!insertError && insertData && insertData.length) {
                profile = insertData[0]
              }
            } catch (err) {
              console.error("Failed to create profile on SIGNED_IN:", err)
            }
          }

          if (!settings) {
            try {
              const { data: insertSettings, error: insertSettingsError } = await supabase
                .from("user_settings")
                .insert({
                  user_id: session.user.id,
                  theme: "system",
                  language: "en",
                  voice_enabled: false,
                  selected_chat_mode: "general",
                  ui_style: "modern",
                })
                .select()

              if (!insertSettingsError && insertSettings && insertSettings.length) {
                settings = insertSettings[0]
              }
            } catch (err) {
              console.error("Failed to create default settings on SIGNED_IN:", err)
            }
          }

          setState({
            user: session.user,
            session,
            profile,
            settings,
            isLoading: false,
            isAuthenticated: true,
            role: profile?.role || "authenticated",
          })
        } else if (event === "SIGNED_OUT") {
          setState({
            user: null,
            session: null,
            profile: null,
            settings: null,
            isLoading: false,
            isAuthenticated: false,
            role: "guest",
          })
        } else if (event === "TOKEN_REFRESHED" && session) {
          setState(prev => ({ ...prev, session }))
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [supabase, fetchProfile, fetchSettings])

  const signUp = async (email: string, password: string, displayName?: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName,
          },
        },
      })

      if (error) throw error

      // Create user profile and settings
      if (data.user) {
        await supabase.from("users").insert({
          id: data.user.id,
          email: data.user.email!,
          display_name: displayName || null,
          role: "authenticated",
        })

        await supabase.from("user_settings").insert({
          user_id: data.user.id,
          theme: "system",
          language: "en",
          voice_enabled: false,
          selected_chat_mode: "general",
          ui_style: "modern",
        })
      }

      return { error: null }
    } catch (error) {
      return { error: error as Error }
    }
  }

  const signIn = async (email: string, password: string, remember = true) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) throw error
      return { error: null }
    } catch (error) {
      return { error: error as Error }
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  const resetPassword = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      })
      if (error) throw error
      return { error: null }
    } catch (error) {
      return { error: error as Error }
    }
  }

  const updatePassword = async (password: string) => {
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      return { error: null }
    } catch (error) {
      return { error: error as Error }
    }
  }

  const updateSettings = async (updates: Partial<UserSettings>) => {
    if (!state.user) return { error: new Error("Not authenticated") }

    try {
      const { error } = await supabase
        .from("user_settings")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("user_id", state.user.id)

      if (error) throw error

      setState(prev => ({
        ...prev,
        settings: prev.settings ? { ...prev.settings, ...updates } : null,
      }))

      return { error: null }
    } catch (error) {
      return { error: error as Error }
    }
  }

  return (
    <AuthContext.Provider
      value={{
        ...state,
        signUp,
        signIn,
        signOut,
        resetPassword,
        updatePassword,
        refreshProfile,
        refreshSettings,
        updateSettings,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
