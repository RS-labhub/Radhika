"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { useFeatureAccess } from "@/hooks/use-feature-access"
import { useAdminStatus } from "@/hooks/use-admin-status"
import { Button } from "@/components/ui/button"
import { UserAvatar } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { 
  Settings, 
  LogOut, 
  LayoutDashboard, 
  Star,
  Crown,
  LogIn,
  Shield
} from "lucide-react"
import { cn } from "@/lib/utils"

interface UserProfile {
  display_name?: string | null
  avatar_url?: string | null
}

interface UserMenuProps {
  isPixel?: boolean
  accentRingClass?: string
}

export function UserMenu({ isPixel = false, accentRingClass }: UserMenuProps) {
  const { user, signOut, isLoading } = useAuth()
  const { isAuthenticated, isPremium, isAdmin: featureAdmin } = useFeatureAccess()
  const { isAdmin: isReservedEmailAdmin } = useAdminStatus()
  const router = useRouter()
  const [profile, setProfile] = useState<UserProfile | null>(null)

  // Fetch profile data when user is authenticated
  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) {
        setProfile(null)
        return
      }

      try {
        const response = await fetch("/api/users", {
          credentials: 'include',
          headers: {
            'x-user-id': user.$id,
          },
        })
        if (response.ok) {
          const data = await response.json()
          console.log("[UserMenu] Fetched profile data:", data.profile)
          console.log("[UserMenu] Avatar URL:", data.profile?.avatar_url)
          setProfile(data.profile)
        } else if (response.status === 401) {
          // User is not authenticated - silently clear profile
          console.log("[UserMenu] User not authenticated, clearing profile")
          setProfile(null)
        } else {
          console.error("[UserMenu] Failed to fetch profile, status:", response.status)
        }
      } catch (error) {
        console.error("[UserMenu] Failed to fetch profile:", error)
        // Silently handle errors to avoid showing errors during sign out
        setProfile(null)
      }
    }

    fetchProfile()
  }, [user])

  const handleSignOut = async () => {
    await signOut()
    // Notify other parts of the app (notably the chat page) that the user has signed out
    try {
      if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
        window.dispatchEvent(new CustomEvent("radhika:signOut"))
      }
    } catch (e) {
      // non-fatal
    }

    router.push("/")
  }

  if (isLoading) {
    return (
      <div className={cn(
        "h-9 w-9 rounded-full animate-pulse",
        isPixel ? "pixel-surface" : "bg-slate-200 dark:bg-slate-700"
      )} />
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center gap-2">
        <Link href="/auth/login">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              isPixel
                ? "pixel-control text-slate-600 dark:text-slate-300"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            )}
          >
            <LogIn className="h-4 w-4 mr-2" />
            Sign In
          </Button>
        </Link>
        <Link href="/auth/signup">
          <Button
            size="sm"
            className={cn(
              isPixel
                ? "pixel-btn"
                : "bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white shadow-md"
            )}
          >
            Sign Up
          </Button>
        </Link>
      </div>
    )
  }

  const rawName = profile?.display_name || user?.email?.split("@")[0] || "User"
  const maxNameLen = 20
  const truncatedName = rawName.length > maxNameLen ? rawName.slice(0, maxNameLen) + "…" : rawName

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            "relative h-9 w-9 rounded-full p-0",
            isPixel && "pixel-control",
            accentRingClass
          )}
        >
          <UserAvatar
            avatarUrl={profile?.avatar_url}
            name={profile?.display_name}
            email={user?.email}
            size="sm"
            isPixel={isPixel}
            className="h-9 w-9"
          />
          {(isPremium || featureAdmin) && (
            <div className="absolute -top-1 -right-1">
              <Crown className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
            </div>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align="end" 
        className={cn(
          "w-56",
          isPixel && "border-2 border-slate-400/50 dark:border-slate-600/50 bg-slate-50 dark:bg-slate-900 shadow-[0_8px_0_rgba(15,23,42,0.12)] dark:shadow-[0_8px_0_rgba(15,23,42,0.4)] rounded-lg"
        )}
      >
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{truncatedName}</p>
            <p className="text-xs leading-normal text-slate-500 dark:text-slate-400 break-all">{user?.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        <DropdownMenuItem asChild>
          <Link href="/dashboard" className="cursor-pointer">
            <LayoutDashboard className="mr-2 h-4 w-4" />
            <span>Dashboard</span>
          </Link>
        </DropdownMenuItem>
        
        <DropdownMenuItem asChild>
          <Link href="/favorites" className="cursor-pointer">
            <Star className="mr-2 h-4 w-4" />
            <span>Favorites</span>
          </Link>
        </DropdownMenuItem>
        
        <DropdownMenuItem asChild>
          <Link href="/settings" className="cursor-pointer">
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </Link>
        </DropdownMenuItem>
        
        {isReservedEmailAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/admin" className="cursor-pointer text-cyan-600 dark:text-cyan-400">
                <Shield className="mr-2 h-4 w-4" />
                <span>Admin Panel</span>
              </Link>
            </DropdownMenuItem>
          </>
        )}
        
        <DropdownMenuSeparator />
        
        <DropdownMenuItem 
          onClick={handleSignOut}
          className="cursor-pointer text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400"
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>Sign out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
