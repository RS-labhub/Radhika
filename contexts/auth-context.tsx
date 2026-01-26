"use client"

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react"
import { getAccount, resetAppwriteClients } from "@/lib/appwrite/client"
import type { Models } from "appwrite"
import type { UserRole } from "@/types/database"

interface AuthContextType {
  user: Models.User<Models.Preferences> | null
  profile: null // Backwards compatibility - profiles handled separately
  loading: boolean
  isLoading: boolean // Alias for loading
  isAuthenticated: boolean
  role: UserRole
  signIn: (email: string, password: string, remember?: boolean) => Promise<{ error?: Error } | void>
  signUp: (email: string, password: string, name?: string) => Promise<{ error?: Error }>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<{ error?: Error }>
  updatePassword: (password: string) => Promise<{ error?: Error }>
  sendPasswordRecovery: (email: string) => Promise<void>
  confirmPasswordRecovery: (userId: string, secret: string, password: string) => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Models.User<Models.Preferences> | null>(null)
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<UserRole>('guest')

  const refreshUser = useCallback(async () => {
    try {
      const account = getAccount()
      const currentUser = await account.get()
      setUser(currentUser)
      
      // Determine role based on user labels or default to authenticated
      // Appwrite stores custom user data in labels or prefs
      const labels = currentUser.labels || []
      if (labels.includes('admin')) {
        setRole('admin')
      } else if (labels.includes('premium')) {
        setRole('premium')
      } else {
        setRole('authenticated')
      }
      
      // Store session in cookie for server-side access
      // Note: In Appwrite v21+, we need to store the session secret, not just the ID
      try {
        const session = await account.getSession('current')
        if (session) {
          // Determine if we're on localhost (don't use secure for local dev)
          const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
          const secureFlag = isLocalhost ? '' : '; secure'
          
          // The session secret is needed for server-side validation
          // Store both the session ID and use it with x-user-id header as fallback
          document.cookie = `appwrite-session=${session.secret || session.$id}; path=/; max-age=2592000${secureFlag}; samesite=lax`
          document.cookie = `appwrite-user-id=${currentUser.$id}; path=/; max-age=2592000${secureFlag}; samesite=lax`
        }
      } catch {
        // Session might not exist yet
      }
    } catch (error: any) {
      // If it's a "guest" error or unauthorized, just clear user
      if (error.code === 401 || error.type === 'general_unauthorized_scope') {
        setUser(null)
        setRole('guest')
      } else {
        console.error("Failed to refresh user:", error)
        setUser(null)
        setRole('guest')
      }
    }
  }, [])

  useEffect(() => {
    const initAuth = async () => {
      setLoading(true)
      try {
        await refreshUser()
      } catch {
        // Silent fail for initial check
      } finally {
        setLoading(false)
      }
    }

    initAuth()
    
    // Listen for sign out events (e.g., from account deletion)
    const handleSignOutEvent = () => {
      console.log("[AuthContext] Sign out event received")
      setUser(null)
      setRole('guest')
    }
    
    if (typeof window !== 'undefined') {
      window.addEventListener('radhika:signOut', handleSignOutEvent)
    }
    
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('radhika:signOut', handleSignOutEvent)
      }
    }
  }, [refreshUser])

  const signIn = useCallback(async (email: string, password: string, remember?: boolean): Promise<{ error?: Error } | void> => {
    try {
      const account = getAccount()
      
      // Create email session
      const session = await account.createEmailPasswordSession(email, password)
      
      // Session expiry: 30 days if remember, 1 day otherwise
      const maxAge = remember ? 2592000 : 86400
      
      // Determine if we're on localhost (don't use secure for local dev)
      const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      const secureFlag = isLocalhost ? '' : '; secure'
      
      // Store session in cookie for server-side access
      document.cookie = `appwrite-session=${session.secret || session.$id}; path=/; max-age=${maxAge}${secureFlag}; samesite=lax`
      
      // Also store user ID for fallback auth
      try {
        const user = await account.get()
        document.cookie = `appwrite-user-id=${user.$id}; path=/; max-age=${maxAge}${secureFlag}; samesite=lax`
      } catch {
        // User might not be available yet
      }
      
      // Refresh user info
      await refreshUser()
      
      // Initialize user in database
      try {
        await fetch('/api/users/init', { method: 'POST' })
      } catch (err) {
        console.warn('Failed to initialize user data:', err)
      }
      
      return undefined
    } catch (error) {
      return { error: error as Error }
    }
  }, [refreshUser])

  const signUp = useCallback(async (email: string, password: string, name?: string): Promise<{ error?: Error }> => {
    try {
      const account = getAccount()
      
      // Create the account
      await account.create('unique()', email, password, name)
      
      // Send email verification - DISABLED FOR NOW
      // Users can directly access dashboard after signup
      // try {
      //   const verifyUrl = `${window.location.origin}/auth/confirm`
      //   await account.createVerification(verifyUrl)
      // } catch (verifyError) {
      //   console.warn('Failed to send verification email:', verifyError)
      //   // Don't fail signup if verification email fails
      // }
      
      // Sign in immediately after signup
      await signIn(email, password)
      
      return {}
    } catch (error) {
      return { error: error as Error }
    }
  }, [signIn])

  const signOut = useCallback(async () => {
    try {
      const account = getAccount()
      await account.deleteSession('current')
    } catch (error) {
      console.warn('Error deleting session:', error)
    }
    
    // Clear the session cookies
    document.cookie = 'appwrite-session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
    document.cookie = 'appwrite-user-id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
    
    // Reset Appwrite clients
    resetAppwriteClients()
    
    setUser(null)
    setRole('guest')
  }, [])

  const resetPassword = useCallback(async (email: string): Promise<{ error?: Error }> => {
    try {
      const account = getAccount()
      const resetUrl = `${window.location.origin}/auth/reset-password`
      await account.createRecovery(email, resetUrl)
      return {}
    } catch (error) {
      return { error: error as Error }
    }
  }, [])

  const updatePassword = useCallback(async (password: string): Promise<{ error?: Error }> => {
    try {
      const account = getAccount()
      await account.updatePassword(password)
      return {}
    } catch (error) {
      return { error: error as Error }
    }
  }, [])

  const sendPasswordRecovery = useCallback(async (email: string) => {
    const account = getAccount()
    const resetUrl = `${window.location.origin}/auth/reset-password`
    await account.createRecovery(email, resetUrl)
  }, [])

  const confirmPasswordRecovery = useCallback(async (userId: string, secret: string, password: string) => {
    const account = getAccount()
    await account.updateRecovery(userId, secret, password)
  }, [])

  const value: AuthContextType = {
    user,
    profile: null, // Profiles handled separately via /api/profiles
    loading,
    isLoading: loading, // Alias for backwards compatibility
    isAuthenticated: !!user,
    role,
    signIn,
    signUp,
    signOut,
    resetPassword,
    updatePassword,
    sendPasswordRecovery,
    confirmPasswordRecovery,
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
