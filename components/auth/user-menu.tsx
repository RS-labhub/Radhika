"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { useFeatureAccess } from "@/hooks/use-feature-access"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { 
  User, 
  Settings, 
  LogOut, 
  LayoutDashboard, 
  Star,
  Crown,
  LogIn
} from "lucide-react"
import { cn } from "@/lib/utils"

interface UserMenuProps {
  isPixel?: boolean
  accentRingClass?: string
}

export function UserMenu({ isPixel = false, accentRingClass }: UserMenuProps) {
  const { user, profile, signOut, isLoading } = useAuth()
  const { isAuthenticated, isPremium, isAdmin } = useFeatureAccess()
  const router = useRouter()

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
  const initials = rawName.slice(0, 2).toUpperCase()

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
          <Avatar className={cn(
            "h-9 w-9",
            isPixel ? "pixel-avatar" : "ring-2 ring-white/50 dark:ring-slate-700/50"
          )}>
            <AvatarImage src={profile?.avatar_url || undefined} alt={rawName} />
            <AvatarFallback className={cn(
              "text-sm font-medium",
              isPixel
                ? "pixel-surface text-slate-700 dark:text-slate-200"
                : "bg-gradient-to-br from-cyan-500 to-blue-600 text-white"
            )}>
              {initials}
            </AvatarFallback>
          </Avatar>
          {(isPremium || isAdmin) && (
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
          isPixel && "pixel-panel"
        )}
      >
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{truncatedName}</p>
            <p className="text-xs leading-none text-slate-500 dark:text-slate-400">{user?.email}</p>
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
