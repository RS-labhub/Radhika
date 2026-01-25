"use client"

import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/contexts/auth-context"
import { STORAGE_KEYS } from "@/lib/constants"

interface AdminStatusCache {
  isAdmin: boolean
  userId: string
  timestamp: number
}

// Cache duration: 5 minutes
const CACHE_DURATION = 5 * 60 * 1000

/**
 * Hook to check and cache admin status
 * Prevents excessive DB calls by caching the result
 */
export function useAdminStatus() {
  const { user, isLoading: authLoading } = useAuth()
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [isChecking, setIsChecking] = useState(false)

  const checkAdminStatus = useCallback(async (forceRefresh = false) => {
    if (!user) {
      setIsAdmin(false)
      return false
    }

    // Try to get from cache first (unless force refresh)
    if (!forceRefresh && typeof window !== "undefined") {
      try {
        const cached = sessionStorage.getItem(STORAGE_KEYS.ADMIN_STATUS)
        if (cached) {
          const data: AdminStatusCache = JSON.parse(cached)
          // Check if cache is valid (same user and not expired)
          if (data.userId === user.$id && Date.now() - data.timestamp < CACHE_DURATION) {
            setIsAdmin(data.isAdmin)
            return data.isAdmin
          }
        }
      } catch (e) {
        // Ignore cache errors
      }
    }

    // Fetch from API
    setIsChecking(true)
    try {
      const response = await fetch("/api/check-admin", {
        credentials: 'include',
        headers: {
          'x-user-id': user.$id
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        const adminStatus = data.isAdmin === true
        
        // Cache the result
        if (typeof window !== "undefined") {
          try {
            const cacheData: AdminStatusCache = {
              isAdmin: adminStatus,
              userId: user.$id,
              timestamp: Date.now()
            }
            sessionStorage.setItem(STORAGE_KEYS.ADMIN_STATUS, JSON.stringify(cacheData))
          } catch (e) {
            // Ignore cache errors
          }
        }
        
        setIsAdmin(adminStatus)
        return adminStatus
      } else {
        setIsAdmin(false)
        return false
      }
    } catch (error) {
      console.error("Failed to check admin status:", error)
      setIsAdmin(false)
      return false
    } finally {
      setIsChecking(false)
    }
  }, [user])

  // Check admin status when user changes
  useEffect(() => {
    if (!authLoading) {
      if (user) {
        checkAdminStatus()
      } else {
        setIsAdmin(false)
        // Clear cache on logout
        if (typeof window !== "undefined") {
          try {
            sessionStorage.removeItem(STORAGE_KEYS.ADMIN_STATUS)
          } catch (e) {
            // Ignore
          }
        }
      }
    }
  }, [user, authLoading, checkAdminStatus])

  // Clear cache on sign out event
  useEffect(() => {
    const handleSignOut = () => {
      setIsAdmin(false)
      if (typeof window !== "undefined") {
        try {
          sessionStorage.removeItem(STORAGE_KEYS.ADMIN_STATUS)
        } catch (e) {
          // Ignore
        }
      }
    }

    if (typeof window !== "undefined") {
      window.addEventListener("radhika:signOut", handleSignOut)
      return () => window.removeEventListener("radhika:signOut", handleSignOut)
    }
  }, [])

  return {
    isAdmin,
    isChecking,
    isLoading: authLoading || isChecking || isAdmin === null,
    refreshAdminStatus: () => checkAdminStatus(true)
  }
}
