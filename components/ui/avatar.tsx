"use client"

import * as React from "react"
import * as AvatarPrimitive from "@radix-ui/react-avatar"

import { cn } from "@/lib/utils"

const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full",
      className
    )}
    {...props}
  />
))
Avatar.displayName = AvatarPrimitive.Root.displayName

const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Image
    ref={ref}
    className={cn("aspect-square h-full w-full", className)}
    {...props}
  />
))
AvatarImage.displayName = AvatarPrimitive.Image.displayName

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn(
      "flex h-full w-full items-center justify-center rounded-full bg-muted",
      className
    )}
    {...props}
  />
))
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName

// ============================================================================
// UserAvatar - A higher-level avatar component that handles user profiles
// ============================================================================

/**
 * Resolve an avatar URL which may be:
 * - A full URL (http/https/blob) - returned as-is
 * - An Appwrite file ID - converted to full URL
 * - null/undefined - returned as undefined
 */
export function resolveAvatarUrl(avatarUrl?: string | null): string | undefined {
  if (!avatarUrl) return undefined
  
  // If it's already a full URL (http, https, blob), return as-is
  if (avatarUrl.startsWith('http://') || 
      avatarUrl.startsWith('https://') || 
      avatarUrl.startsWith('blob:') ||
      avatarUrl.startsWith('data:')) {
    return avatarUrl
  }
  
  // If starts with /, it's likely a relative path being accidentally used - skip it
  if (avatarUrl.startsWith('/')) {
    console.warn('Avatar URL starts with /, this may be an error:', avatarUrl)
    return undefined
  }
  
  // It's likely an Appwrite file ID - convert to full URL
  const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || ''
  const bucketId = process.env.NEXT_PUBLIC_APPWRITE_AVATARS_BUCKET_ID || 'avatars'
  const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1'
  
  // If we don't have a project ID, we can't construct a valid URL
  if (!projectId) {
    console.warn('Missing NEXT_PUBLIC_APPWRITE_PROJECT_ID for avatar URL resolution')
    return undefined
  }
  
  return `${endpoint}/storage/buckets/${bucketId}/files/${avatarUrl}/view?project=${projectId}`
}

interface UserAvatarProps {
  /** Avatar URL - can be full URL or Appwrite file ID */
  avatarUrl?: string | null
  /** User's name for generating initials fallback */
  name?: string | null
  /** User's email for generating initials fallback if name is not available */
  email?: string | null
  /** Size of the avatar */
  size?: "xs" | "sm" | "md" | "lg" | "xl"
  /** Additional className for the Avatar root */
  className?: string
  /** Whether to use pixel styling */
  isPixel?: boolean
  /** Ring className for styling */
  ringClassName?: string
  /** Fallback className for styling */
  fallbackClassName?: string
}

const SIZE_CLASSES = {
  xs: "h-6 w-6 text-xs",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
  xl: "h-16 w-16 text-lg",
}

/**
 * Generate initials from a name or email
 */
function getInitials(name?: string | null, email?: string | null): string {
  if (name) {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase()
    }
    return name.slice(0, 2).toUpperCase()
  }
  if (email) {
    const localPart = email.split("@")[0]
    return localPart.slice(0, 2).toUpperCase()
  }
  return "U"
}

/**
 * UserAvatar - A reusable avatar component for displaying user profiles
 * 
 * Features:
 * - Handles avatar URL from Appwrite or external sources
 * - Generates initials fallback from name or email
 * - Supports multiple sizes
 * - Supports pixel styling for retro UI
 */
const UserAvatar = React.forwardRef<
  HTMLDivElement,
  UserAvatarProps
>(({ 
  avatarUrl, 
  name, 
  email, 
  size = "md", 
  className, 
  isPixel = false,
  ringClassName,
  fallbackClassName,
}, ref) => {
  const initials = getInitials(name, email)
  const sizeClass = SIZE_CLASSES[size]
  
  // Get display name for alt text
  const displayName = name || email?.split("@")[0] || "User"
  
  // Resolve the avatar URL (handle file IDs vs full URLs)
  const resolvedUrl = resolveAvatarUrl(avatarUrl)
  
  // Debug logging
  React.useEffect(() => {
    if (avatarUrl) {
      console.log("[UserAvatar] Input avatarUrl:", avatarUrl)
      console.log("[UserAvatar] Resolved URL:", resolvedUrl)
    }
  }, [avatarUrl, resolvedUrl])

  return (
    <Avatar 
      ref={ref as any}
      className={cn(
        sizeClass.split(" ").slice(0, 2).join(" "), // Extract just h-X w-X
        isPixel ? "pixel-avatar" : ringClassName || "ring-2 ring-white/50 dark:ring-slate-700/50",
        className
      )}
    >
      <AvatarImage 
        src={resolvedUrl} 
        alt={displayName}
        onLoadingStatusChange={(status) => {
          if (status === 'error' && resolvedUrl) {
            console.error("[UserAvatar] Failed to load image:", resolvedUrl)
          }
        }}
      />
      <AvatarFallback 
        className={cn(
          sizeClass.split(" ").slice(2).join(" "), // Extract text-X
          isPixel
            ? "pixel-surface text-slate-700 dark:text-slate-200"
            : fallbackClassName || "bg-gradient-to-br from-cyan-500 to-blue-600 text-white font-medium",
        )}
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  )
})
UserAvatar.displayName = "UserAvatar"

export { Avatar, AvatarImage, AvatarFallback, UserAvatar, getInitials }
