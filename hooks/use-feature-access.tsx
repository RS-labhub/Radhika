"use client"

import { useAuth } from "@/contexts/auth-context"
import type { UserRole } from "@/types/database"
import type { Mode } from "@/types/chat"

interface FeatureAccess {
  canUseMode: (mode: Mode) => boolean
  canUseVoiceNarration: boolean
  canUsePersonalization: boolean
  canUseImageGeneration: boolean
  canUsePixelMode: boolean
  canUseChatHistory: boolean
  canUseProfiles: boolean
  canUseExportTools: boolean
  canUseFavorites: boolean
  dailyMessageLimit: number | null
  remainingMessages: number | null
  isGuest: boolean
  isAuthenticated: boolean
  isPremium: boolean
  isAdmin: boolean
}

// Features available to different roles
const ROLE_FEATURES: Record<UserRole, {
  modes: Mode[]
  voiceNarration: boolean
  personalization: boolean
  imageGeneration: boolean
  pixelMode: boolean
  chatHistory: boolean
  profiles: boolean
  exportTools: boolean
  favorites: boolean
  dailyMessageLimit: number | null
}> = {
  guest: {
    modes: ["general"],
    voiceNarration: false,
    personalization: false,
    imageGeneration: false,
    pixelMode: false,
    chatHistory: false,
    profiles: false,
    exportTools: false,
    favorites: false,
    dailyMessageLimit: 20,
  },
  authenticated: {
    modes: ["general", "productivity", "wellness", "learning", "creative", "bff"],
    voiceNarration: true,
    personalization: true,
    imageGeneration: true,
    pixelMode: true,
    chatHistory: true,
    profiles: true,
    exportTools: true,
    favorites: true,
    dailyMessageLimit: null,
  },
  premium: {
    modes: ["general", "productivity", "wellness", "learning", "creative", "bff"],
    voiceNarration: true,
    personalization: true,
    imageGeneration: true,
    pixelMode: true,
    chatHistory: true,
    profiles: true,
    exportTools: true,
    favorites: true,
    dailyMessageLimit: null,
  },
  admin: {
    modes: ["general", "productivity", "wellness", "learning", "creative", "bff"],
    voiceNarration: true,
    personalization: true,
    imageGeneration: true,
    pixelMode: true,
    chatHistory: true,
    profiles: true,
    exportTools: true,
    favorites: true,
    dailyMessageLimit: null,
  },
}

export function useFeatureAccess(): FeatureAccess {
  const { role, isAuthenticated } = useAuth()
  const features = ROLE_FEATURES[role]

  return {
    canUseMode: (mode: Mode) => features.modes.includes(mode),
    canUseVoiceNarration: features.voiceNarration,
    canUsePersonalization: features.personalization,
    canUseImageGeneration: features.imageGeneration,
    canUsePixelMode: features.pixelMode,
    canUseChatHistory: features.chatHistory,
    canUseProfiles: features.profiles,
    canUseExportTools: features.exportTools,
    canUseFavorites: features.favorites,
    dailyMessageLimit: features.dailyMessageLimit,
    remainingMessages: features.dailyMessageLimit, // TODO: Implement actual tracking
    isGuest: role === "guest",
    isAuthenticated,
    isPremium: role === "premium",
    isAdmin: role === "admin",
  }
}

// HOC for protecting features
export function withFeatureAccess<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  requiredFeature: keyof Omit<FeatureAccess, "canUseMode" | "dailyMessageLimit" | "remainingMessages" | "isGuest" | "isAuthenticated" | "isPremium" | "isAdmin">
) {
  return function FeatureProtectedComponent(props: P) {
    const access = useFeatureAccess()
    
    if (!access[requiredFeature]) {
      return null
    }
    
    return <WrappedComponent {...props} />
  }
}
