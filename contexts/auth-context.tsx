"use client"

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react"
import type { User } from "@supabase/supabase-js"
import { getSupabaseClient } from "@/lib/supabase/client"
import type { UserRole } from "@/types/database"

interface AuthContextType {
  user: User | null
  profile: null // Backwards compatibility - profiles handled separately
  loading: boolean
  isLoading: boolean // Alias for loading
  isAuthenticated: boolean
  role: UserRole
  signIn: (email: string, password: string, remember?: boolean) => Promise<{ error?: Error } | void>
  signUp: (email: string, password: string, name?: string) => Promise<{ error?: Error; needsEmailConfirmation?: boolean }>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<{ error?: Error }>
  updatePassword: (password: string) => Promise<{ error?: Error }>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function getUserDisplayName(user: User | null | undefined): string {
  const meta = user?.user_metadata
  return meta?.name || meta?.display_name || meta?.full_name || ""
}

async function fetchRole(userId: string): Promise<UserRole> {
  try {
    const { data } = await getSupabaseClient().from("users").select("role").eq("id", userId).maybeSingle()
    const role = data?.role as UserRole | undefined
    return role === "admin" || role === "premium" ? role : "authenticated"
  } catch {
    return "authenticated"
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<UserRole>("guest")

  const applyUser = useCallback(async (nextUser: User | null) => {
    setUser(nextUser)
    setRole(nextUser ? await fetchRole(nextUser.id) : "guest")
  }, [])

  const refreshUser = useCallback(async () => {
    try {
      const { data, error } = await getSupabaseClient().auth.getUser()
      await applyUser(error ? null : data.user)
    } catch (error) {
      console.error("Failed to refresh user:", error)
      await applyUser(null)
    }
  }, [applyUser])

  useEffect(() => {
    let active = true
    const supabase = getSupabaseClient()

    refreshUser().finally(() => {
      if (active) setLoading(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") return
      // Defer to avoid awaiting Supabase calls inside the auth callback
      setTimeout(() => {
        if (active) void applyUser(session?.user ?? null)
      }, 0)
    })

    const handleSignOutEvent = () => {
      setUser(null)
      setRole("guest")
    }
    window.addEventListener("radhika:signOut", handleSignOutEvent)

    return () => {
      active = false
      subscription.subscription.unsubscribe()
      window.removeEventListener("radhika:signOut", handleSignOutEvent)
    }
  }, [refreshUser, applyUser])

  const initUser = useCallback(async (currentUser: User) => {
    try {
      await fetch("/api/users/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: getUserDisplayName(currentUser) || undefined }),
      })
    } catch (err) {
      console.warn("Failed to initialize user data:", err)
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string): Promise<{ error?: Error } | void> => {
    const { data, error } = await getSupabaseClient().auth.signInWithPassword({ email, password })
    if (error) return { error }

    await applyUser(data.user)
    await initUser(data.user)
    return undefined
  }, [applyUser, initUser])

  const signUp = useCallback(async (email: string, password: string, name?: string) => {
    const { data, error } = await getSupabaseClient().auth.signUp({
      email,
      password,
      options: {
        data: name ? { name, display_name: name } : undefined,
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    })
    if (error) return { error }

    if (!data.session) return { needsEmailConfirmation: true }

    await applyUser(data.user)
    if (data.user) await initUser(data.user)
    return {}
  }, [applyUser, initUser])

  const signOut = useCallback(async () => {
    try {
      await getSupabaseClient().auth.signOut()
    } catch (error) {
      console.warn("Error signing out:", error)
    }

    try {
      const { localChatStorage } = await import("@/lib/services/local-chat-storage")
      const { localFavoritesStorage } = await import("@/lib/services/local-favorites-storage")
      localChatStorage.clearAll()
      localFavoritesStorage.clearAll()
    } catch (err) {
      console.warn("Failed to clear local storage:", err)
    }

    setUser(null)
    setRole("guest")
  }, [])

  const resetPassword = useCallback(async (email: string): Promise<{ error?: Error }> => {
    const { error } = await getSupabaseClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })
    return error ? { error } : {}
  }, [])

  const updatePassword = useCallback(async (password: string): Promise<{ error?: Error }> => {
    const { error } = await getSupabaseClient().auth.updateUser({ password })
    return error ? { error } : {}
  }, [])

  const value: AuthContextType = {
    user,
    profile: null,
    loading,
    isLoading: loading,
    isAuthenticated: !!user,
    role,
    signIn,
    signUp,
    signOut,
    resetPassword,
    updatePassword,
    refreshUser,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
