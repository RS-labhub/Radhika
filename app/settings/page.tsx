"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { useTheme } from "next-themes"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage, resolveAvatarUrl as sharedResolveAvatarUrl } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { 
  ArrowLeft,
  User,
  Key,
  Settings,
  Sun,
  Moon,
  Monitor,
  Upload,
  Save,
  Eye,
  EyeOff,
  Check,
  Loader2,
  Pencil,
  Palette,
  UserCircle,
  BookOpen
} from "lucide-react"
import { cn } from "@/lib/utils"
import { getStorage } from "@/lib/appwrite/client"
import { APPWRITE_CONFIG } from "@/lib/appwrite/config"
import type { UserGender, UserAge, ConversationTone } from "@/types/chat"

interface Provider {
  id: string
  name: string
  keyName: string
  placeholder: string
  docsUrl: string
  models: string[]
}

const AI_PROVIDERS: Provider[] = [
  {
    id: "openai",
    name: "OpenAI",
    keyName: "OPENAI_API_KEY",
    placeholder: "sk-...",
    docsUrl: "https://platform.openai.com/api-keys",
    models: ["gpt-5", "gpt-4-turbo", "gpt-3.5-turbo"],
  },
  {
    id: "claude",
    name: "Anthropic Claude",
    keyName: "CLAUDE_API_KEY",
    placeholder: "sk-ant-...",
    docsUrl: "https://console.anthropic.com/account/keys",
    models: ["claude-opus-4-1-20250805", "claude-opus-4-1", "claude-3-haiku"],
  },
  {
    id: "groq",
    name: "Groq",
    keyName: "GROQ_API_KEY",
    placeholder: "gsk_...",
    docsUrl: "https://console.groq.com/keys",
    models: ["llama-3.1-8b-instant", "llama-3.3-70b-versatile", "qwen/qwen3-32b"],
  },
  {
    id: "gemini",
    name: "Google Gemini",
    keyName: "GEMINI_API_KEY",
    placeholder: "AIza...",
    docsUrl: "https://aistudio.google.com/app/apikey",
    models: ["gemini-2.5-flash", "gemini-1.5-pro"],
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    keyName: "HUGGINGFACE_API_KEY",
    placeholder: "hf_...",
    docsUrl: "https://huggingface.co/settings/tokens",
    models: ["flux-schnell", "sdxl-lightning"],
  },
  {
    id: "pollinations",
    name: "Pollinations AI (Images)",
    keyName: "POLLINATIONS_API_KEY",
    placeholder: "sk_...",
    docsUrl: "https://pollinations.ai/",
    models: ["flux", "zimage", "turbo", "klein", "klein-large", "gptimage", "seedream", "kontext", "nanobanana", "seedream-pro", "gptimage-large", "nanobanana-pro"],
  },
]

const CUSTOM_MODEL_OPTION = "custom:__user_defined__"

export default function SettingsPage() {
  const { user, isLoading: authLoading, signIn } = useAuth()
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const avatarBucketId = APPWRITE_CONFIG.buckets.avatars
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [deletePassword, setDeletePassword] = useState("")
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [retryCount, setRetryCount] = useState(0)

  // Profile state
  const [displayName, setDisplayName] = useState("")
  const [petName, setPetName] = useState("")
  const [avatarUrl, setAvatarUrl] = useState("")
  const [email, setEmail] = useState("")

  // Personalization state
  const [gender, setGender] = useState<UserGender>("other")
  const [age, setAge] = useState<UserAge>("teenage")
  const [tone, setTone] = useState<ConversationTone>("friendly")

  // API Keys state
  const [apiKeys, setApiKeys] = useState<Record<string, string>>(() => {
    const defaults: Record<string, string> = {}
    AI_PROVIDERS.forEach((provider) => {
      defaults[provider.id] = ""
    })
    return defaults
  })
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({})
  const [providerModels, setProviderModels] = useState<Record<string, string>>(() => {
    const defaults: Record<string, string> = {}
    AI_PROVIDERS.forEach((provider) => {
      defaults[provider.id] = provider.models?.[0] ?? ""
    })
    return defaults
  })

  // Preferences state
  const [voiceEnabled, setVoiceEnabled] = useState(false)
  const [sourcesEnabled, setSourcesEnabled] = useState(false)
  const [sourcesType, setSourcesType] = useState<"any" | "wikipedia" | "documentation">("any")
  const [uiStyle, setUIStyle] = useState<"modern" | "pixel">("modern")
  const [isMounted, setIsMounted] = useState(false)
  const [selectedTheme, setSelectedTheme] = useState<string>("system")

  // Resolve stored avatar references (full URL or storage path) into a usable URL
  const resolveAvatarUrl = async (stored: string) => {
    if (!stored) return ""
    // Already a full URL
    if (stored.startsWith("http")) return stored

    // For Appwrite storage, construct the file view URL
    try {
      const storage = getStorage()
      const fileUrl = storage.getFileView(avatarBucketId, stored)
      return fileUrl.toString()
    } catch (e) {
      console.warn("Failed to get avatar URL from Appwrite:", e)
      return stored
    }
  }

  // Stub for compatibility - Appwrite doesn't use signed URLs the same way
  const getPublicAvatarUrl = (fileId: string) => {
    if (!fileId) return ""
    try {
      const storage = getStorage()
      return storage.getFileView(avatarBucketId, fileId).toString()
    } catch {
      return ""
    }
  }

  useEffect(() => {
    setIsMounted(true)
    if (theme) setSelectedTheme(theme)
  }, [theme])

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth/login?redirectTo=/settings")
    }
  }, [authLoading, user, router])

  // Force refresh data when page becomes visible (handles stuck connections)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && loadError) {
        console.log("Page visible and previous load failed, retrying...")
        setHasLoadedOnce(false)
        setRetryCount(prev => prev + 1)
      }
    }

    const handleOnline = () => {
      if (loadError) {
        console.log("Network restored, retrying load...")
        setHasLoadedOnce(false)
        setRetryCount(prev => prev + 1)
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("online", handleOnline)

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("online", handleOnline)
    }
  }, [loadError])

  // SessionStorage cache key and duration
  const CACHE_KEY = `settings_data_${user?.$id || 'anon'}`
  const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

  const loadFromCache = () => {
    try {
      const cached = sessionStorage.getItem(CACHE_KEY)
      if (cached) {
        const { data, timestamp } = JSON.parse(cached)
        if (Date.now() - timestamp < CACHE_DURATION) {
          return data
        }
      }
    } catch (e) {
      console.error("Failed to load settings from cache:", e)
    }
    return null
  }

  const saveToCache = (data: any) => {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({
        data,
        timestamp: Date.now()
      }))
    } catch (e) {
      console.error("Failed to save settings to cache:", e)
    }
  }

  useEffect(() => {
    const loadSettings = async () => {
      if (!user) {
        setIsLoading(false)
        return
      }

      // Try to load from sessionStorage cache first
      const cachedData = loadFromCache()
      if (cachedData && !loadError) {
        setEmail(user.email || "")
        setDisplayName(cachedData.displayName || "")
        setPetName(cachedData.petName || "")
        if (cachedData.avatarUrl) {
          setAvatarUrl(cachedData.avatarUrl)
        }
        if (cachedData.personalization) {
          setGender(cachedData.personalization.gender || "other")
          setAge(cachedData.personalization.age || "teenage")
          setTone(cachedData.personalization.tone || "friendly")
        }
        
        // Still load from localStorage (not cached since it's local)
        const keys: Record<string, string> = {}
        AI_PROVIDERS.forEach(provider => {
          const key = localStorage.getItem(`${provider.id}_api_key`) || ""
          keys[provider.id] = key
        })
        setApiKeys(keys)
        
        const storedModels = localStorage.getItem("radhika-provider-models")
        if (storedModels) {
          try {
            const parsed = JSON.parse(storedModels) as Record<string, string>
            setProviderModels((prev) => ({ ...prev, ...parsed }))
          } catch (err) {
            console.error("Failed to parse stored models", err)
          }
        }
        
        const storedVoice = localStorage.getItem("voice_enabled")
        const storedUIStyle = localStorage.getItem("ui_style")
        const storedSources = localStorage.getItem("sources_enabled")
        const storedSourcesType = localStorage.getItem("sources_type")
        if (storedVoice !== null) setVoiceEnabled(storedVoice === "true")
        if (storedUIStyle) setUIStyle(storedUIStyle as "modern" | "pixel")
        if (storedSources !== null) setSourcesEnabled(storedSources === "true")
        if (storedSourcesType) setSourcesType(storedSourcesType as "any" | "wikipedia" | "documentation")
        
        setHasLoadedOnce(true)
        setIsLoading(false)
        console.log("Settings: Loaded from sessionStorage cache")
        return
      }

      if (hasLoadedOnce) return // Prevent re-fetching

      try {
        setIsLoading(true)

        // Set email first (always available from auth)
        setEmail(user.email || "")

        // Load user profile and settings from API route (avoids permission issues)
        let loadedDisplayName = ""
        let loadedPetName = ""
        let loadedAvatarUrl = ""

        try {
          const userIdCookie = document.cookie.split('; ').find(row => row.startsWith('appwrite-user-id='))
          const userId = userIdCookie ? userIdCookie.split('=')[1] : user.$id

          const response = await fetch('/api/users', {
            method: 'GET',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              'x-user-id': userId
            }
          })

          if (response.ok) {
            const data = await response.json()
            
            if (data.profile) {
              // Prefer DB value but fall back to auth metadata if absent
              const dbDisplay = data.profile.display_name
              const metaDisplay = data.name || ""
              loadedDisplayName = dbDisplay ?? metaDisplay ?? ""
              loadedPetName = data.profile.pet_name || ""
              setDisplayName(loadedDisplayName)
              setPetName(loadedPetName)
              
              if (data.profile.avatar_url) {
                try {
                  loadedAvatarUrl = await resolveAvatarUrl(data.profile.avatar_url)
                  setAvatarUrl(loadedAvatarUrl)
                } catch (e) {
                  console.warn("Failed to resolve avatar URL", e)
                  loadedAvatarUrl = data.profile.avatar_url
                  setAvatarUrl(loadedAvatarUrl)
                }
              }
            }

            if (data.settings?.personalization) {
              const personalizationData = data.settings.personalization
              const loadedGender = personalizationData.gender
              const validGender = ["boy", "girl", "other"].includes(loadedGender) ? loadedGender : "other"
              const loadedAge = personalizationData.age
              const validAge = ["kid", "teenage", "mature", "senior"].includes(loadedAge) ? loadedAge : "teenage"
              const loadedTone = personalizationData.tone
              const validTone = ["professional", "casual", "friendly", "empathetic", "playful"].includes(loadedTone) ? loadedTone : "friendly"
              
              setGender(validGender)
              setAge(validAge)
              setTone(validTone)
            }
          }
        } catch (userError) {
          console.error("Error loading user data from API:", userError)
          // Continue anyway - user might not have a profile yet
        }

        // Save to sessionStorage cache (only DB data)
        saveToCache({
          displayName: loadedDisplayName,
          petName: loadedPetName,
          avatarUrl: loadedAvatarUrl,
          personalization: { gender, age, tone }
        })
        console.log("Settings: Saved to sessionStorage cache")

        // Load API keys from localStorage
        const keys: Record<string, string> = {}
        AI_PROVIDERS.forEach(provider => {
          const key = localStorage.getItem(`${provider.id}_api_key`) || ""
          keys[provider.id] = key
        })
        setApiKeys(keys)

        // Load model preferences
        const storedModels = localStorage.getItem("radhika-provider-models")
        if (storedModels) {
          try {
            const parsed = JSON.parse(storedModels) as Record<string, string>
            setProviderModels((prev) => ({ ...prev, ...parsed }))
          } catch (err) {
            console.error("Failed to parse stored models", err)
          }
        }

        // Load preferences from localStorage
        const storedVoice = localStorage.getItem("voice_enabled")
        const storedUIStyle = localStorage.getItem("ui_style")
        const storedSources = localStorage.getItem("sources_enabled")
        const storedSourcesType = localStorage.getItem("sources_type")
        
        if (storedVoice !== null) setVoiceEnabled(storedVoice === "true")
        if (storedUIStyle) setUIStyle(storedUIStyle as "modern" | "pixel")
        if (storedSources !== null) setSourcesEnabled(storedSources === "true")
        if (storedSourcesType) setSourcesType(storedSourcesType as "any" | "wikipedia" | "documentation")

        setHasLoadedOnce(true)
        setLoadError(false)
      } catch (err) {
        console.error("Failed to load settings:", err)
        setLoadError(true)
        // Still mark as loaded to prevent infinite loading
        setHasLoadedOnce(true)
      } finally {
        setIsLoading(false)
      }
    }

    loadSettings()
  }, [user, hasLoadedOnce, retryCount])

  // Manual retry function - clears cache to force fresh fetch
  const handleRetry = () => {
    try {
      sessionStorage.removeItem(CACHE_KEY)
    } catch (e) {
      // Ignore
    }
    setHasLoadedOnce(false)
    setLoadError(false)
    setRetryCount(prev => prev + 1)
  }

  const handleAvatarClick = () => {
    fileInputRef.current?.click()
  }

  const extractStoragePath = (urlOrPath: string | null | undefined) => {
    if (!urlOrPath) return null
    if (!urlOrPath.startsWith("http")) return urlOrPath
    const signMatch = urlOrPath.match(/storage\/v1\/object\/sign\/[^/]+\/([^?]+)/)
    if (signMatch?.[1]) return decodeURIComponent(signMatch[1])
    const publicMatch = urlOrPath.match(/storage\/v1\/object\/public\/([^?]+)/)
    if (publicMatch?.[1]) return decodeURIComponent(publicMatch[1])
    return null
  }

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !user) return

    try {
      setIsUploadingAvatar(true)

      // Upload via API route to avoid permission issues
      const formData = new FormData()
      formData.append('avatar', file)

      const userIdCookie = document.cookie.split('; ').find(row => row.startsWith('appwrite-user-id='))
      const userId = userIdCookie ? userIdCookie.split('=')[1] : user.$id

      const response = await fetch('/api/users/avatar', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'x-user-id': userId
        },
        body: formData
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to upload avatar')
      }

      const data = await response.json()
      setAvatarUrl(data.avatarUrl)
      
      // Invalidate cache after successful upload
      try {
        sessionStorage.removeItem(CACHE_KEY)
      } catch (e) {
        // Ignore
      }

      toast.success("Avatar uploaded successfully")
    } catch (err) {
      console.error("Avatar upload error:", err)
      const message = err instanceof Error ? err.message : "Failed to upload avatar"
      toast.error(message)
    } finally {
      setIsUploadingAvatar(false)
    }
  }

  const handleSaveProfile = async () => {
    if (!user) return

    try {
      setIsSaving(true)

      const userIdCookie = document.cookie.split('; ').find(row => row.startsWith('appwrite-user-id='))
      const userId = userIdCookie ? userIdCookie.split('=')[1] : user.$id

      const response = await fetch('/api/users', {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId
        },
        body: JSON.stringify({
          display_name: displayName.trim(),
          pet_name: petName.trim() || null,
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to save profile')
      }
      
      // Invalidate cache after successful save
      try {
        sessionStorage.removeItem(CACHE_KEY)
      } catch (e) {
        // Ignore
      }
      
      toast.success("Profile saved successfully")
    } catch (err) {
      console.error("Failed to save profile:", err)
      const message = err instanceof Error ? err.message : "Failed to save profile"
      toast.error(message)
    } finally {
      setIsSaving(false)
    }
  }

  const performDeleteAccount = async () => {
    if (!user) return

    if (!deletePassword) {
      toast.error("Please enter your password to confirm")
      return
    }

    try {
      setIsDeletingAccount(true)

      // Send password to API for verification before deletion
      const res = await fetch("/api/delete-account", { 
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(user?.$id && { "x-user-id": user.$id }),
        },
        body: JSON.stringify({ password: deletePassword })
      })
      const json = await res.json()
      
      if (!res.ok) {
        if (res.status === 401) {
          toast.error("Incorrect password")
        } else {
          throw new Error(json?.error || "Failed to delete account")
        }
        return
      }
      
      // Account deleted successfully
      toast.success("Account deleted successfully")
      
      // Clear the session and sign out before redirecting
      try {
        // Clear session cookies
        document.cookie = 'appwrite-session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
        document.cookie = 'appwrite-user-id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
        
        // Trigger sign out event for other components
        if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
          window.dispatchEvent(new CustomEvent("radhika:signOut"))
        }
      } catch (e) {
        console.warn("Error clearing session:", e)
      }
      
      // Redirect to home page
      router.push("/")
    } catch (err) {
      console.error("Failed to delete account:", err)
      toast.error("Failed to delete account")
    } finally {
      setIsDeletingAccount(false)
      setIsDeleteDialogOpen(false)
      setDeletePassword("")
    }
  }

  const handleSavePersonalization = async () => {
    if (!user) return

    try {
      setIsSaving(true)

      const personalization = { gender, age, tone }

      const userIdCookie = document.cookie.split('; ').find(row => row.startsWith('appwrite-user-id='))
      const userId = userIdCookie ? userIdCookie.split('=')[1] : user.$id

      const response = await fetch('/api/users', {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId
        },
        body: JSON.stringify({ personalization })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to save personalization')
      }

      // Invalidate cache after successful save
      try {
        sessionStorage.removeItem(CACHE_KEY)
      } catch (e) {
        // Ignore
      }

      // Keep local storage in sync for the chat page fallback
      try {
        localStorage.setItem("radhika-personalization", JSON.stringify(personalization))
      } catch (storageError) {
        console.warn("Failed to persist personalization locally", storageError)
      }

      toast.success("Personalization saved")
    } catch (err) {
      console.error("Failed to save personalization:", err)
      const message = err instanceof Error ? err.message : "Failed to save personalization"
      toast.error(message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveAPIKeys = () => {
    try {
      // Persist keys per provider for backwards compatibility
      AI_PROVIDERS.forEach(provider => {
        if (apiKeys[provider.id]) {
          localStorage.setItem(`${provider.id}_api_key`, apiKeys[provider.id])
        } else {
          localStorage.removeItem(`${provider.id}_api_key`)
        }
      })

      // Persist aggregated map used by the chat page
      const aggregatedKeys = {
        openai: apiKeys.openai || "",
        claude: apiKeys.claude || "",
        groq: apiKeys.groq || "",
        gemini: apiKeys.gemini || "",
        huggingface: apiKeys.huggingface || "",
      }
      localStorage.setItem("radhika-api-keys", JSON.stringify(aggregatedKeys))

      // Persist model preferences
      localStorage.setItem("radhika-provider-models", JSON.stringify(providerModels))

      toast.success("AI provider settings saved")
    } catch (err) {
      console.error("Failed to save API keys:", err)
      const message = err instanceof Error ? err.message : "Failed to save provider settings"
      toast.error(message)
    }
  }

  // Persist preferences immediately when they change
  useEffect(() => {
    if (typeof window === "undefined") return
    if (!hasLoadedOnce) return // Don't persist before initial load
    try {
      localStorage.setItem("voice_enabled", String(voiceEnabled))
      localStorage.setItem("ui_style", uiStyle)
      localStorage.setItem("sources_enabled", String(sourcesEnabled))
      localStorage.setItem("sources_type", sourcesType)
      // Dispatch event to notify chat component of sources change
      window.dispatchEvent(new CustomEvent("radhika:sourcesChanged", { 
        detail: { enabled: sourcesEnabled, type: sourcesType } 
      }))
    } catch (err) {
      console.error("Failed to save preferences:", err)
    }
  }, [voiceEnabled, uiStyle, sourcesEnabled, sourcesType, hasLoadedOnce])

  const toggleKeyVisibility = (providerId: string) => {
    setVisibleKeys(prev => ({ ...prev, [providerId]: !prev[providerId] }))
  }

  const updateApiKey = (providerId: string, value: string) => {
    setApiKeys(prev => ({ ...prev, [providerId]: value }))
  }

  const updateProviderModel = (providerId: string, value: string) => {
    setProviderModels(prev => ({ ...prev, [providerId]: value }))
  }

  const renderModelSelect = (provider: Provider) => {
    const currentValue = providerModels[provider.id] || provider.models[0]
    const isCustom = currentValue === CUSTOM_MODEL_OPTION

    return (
      <div className="space-y-2">
        <Label className="text-xs text-slate-500">Preferred model</Label>
        <Select
          value={isCustom ? CUSTOM_MODEL_OPTION : currentValue}
          onValueChange={(value) => {
            if (value === CUSTOM_MODEL_OPTION) {
              updateProviderModel(provider.id, CUSTOM_MODEL_OPTION)
            } else {
              updateProviderModel(provider.id, value)
            }
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {provider.models.map((model) => (
              <SelectItem key={model} value={model}>
                {model}
              </SelectItem>
            ))}
            <SelectItem value={CUSTOM_MODEL_OPTION}>Add your own model…</SelectItem>
          </SelectContent>
        </Select>
        {isCustom && (
          <Input
            placeholder="Enter custom model name"
            value={providerModels[provider.id]?.startsWith("custom:") ? providerModels[provider.id].replace("custom:", "") : ""}
            onChange={(e) => {
              const val = e.target.value
              updateProviderModel(provider.id, val ? `custom:${val}` : CUSTOM_MODEL_OPTION)
            }}
          />
        )}
      </div>
    )
  }

  const getInitials = (name: string) => {
    if (!name) return "U"
    return name
      .split(" ")
      .map(n => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    )
  }

  if (!user) {
    return null
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    )
  }

  // Show error state with retry button
  if (loadError && !hasLoadedOnce) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
            Connection Issue
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mb-4">
            Unable to load settings. This might be a temporary issue.
          </p>
          <Button onClick={handleRetry} className="gap-2">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="container mx-auto max-w-4xl px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Settings</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Manage your account and preferences
            </p>
          </div>
        </div>

        {/* Settings Tabs */}
        <Tabs defaultValue="profile" className="w-full">
      <TabsList className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-0">
            <TabsTrigger value="profile">
              <User className="mr-2 h-4 w-4" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="personalization">
              <UserCircle className="mr-2 h-4 w-4" />
              Personalization
            </TabsTrigger>
            <TabsTrigger value="providers">
              <Key className="mr-2 h-4 w-4" />
              AI Providers
            </TabsTrigger>
            <TabsTrigger value="preferences">
              <Palette className="mr-2 h-4 w-4" />
              Preferences
            </TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Profile Information</CardTitle>
                <CardDescription>
                  Update your personal information and avatar
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Avatar Upload */}
                <div className="flex items-center gap-6">
                  <div className="relative">
                    <div className="rounded-full p-1 bg-gradient-to-br from-cyan-500 via-blue-500 to-purple-500">
                      <Avatar className="h-24 w-24 border-4 border-white dark:border-slate-900">
                        <AvatarImage src={avatarUrl} alt={displayName} />
                        <AvatarFallback className="text-lg bg-gradient-to-br from-cyan-100 to-blue-100 dark:from-cyan-950 dark:to-blue-950">
                          {getInitials(displayName)}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                    <Button
                      size="icon"
                      variant="secondary"
                      className="absolute -bottom-2 -right-2 h-8 w-8 rounded-full shadow-md"
                      onClick={handleAvatarClick}
                      disabled={isUploadingAvatar}
                    >
                      {isUploadingAvatar ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarUpload}
                    />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                      Profile Picture
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Click the upload button to change your avatar
                    </p>
                  </div>
                </div>

                {/* Email (Read-only) */}
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={email} disabled />
                  <p className="text-xs text-slate-500">
                    Your email address cannot be changed
                  </p>
                </div>

                {/* Display Name */}
                <div className="space-y-2">
                  <Label htmlFor="displayName">Display Name *</Label>
                  <Input
                    id="displayName"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Enter your full name"
                  />
                  <p className="text-xs text-slate-500">
                    This is your full name that will be displayed
                  </p>
                </div>

                {/* Pet Name */}
                <div className="space-y-2">
                  <Label htmlFor="petName">Pet Name (Optional)</Label>
                  <Input
                    id="petName"
                    value={petName}
                    onChange={(e) => setPetName(e.target.value)}
                    placeholder="How should the AI call you?"
                  />
                  <p className="text-xs text-slate-500">
                    If set, the AI will use this name instead of your first name. Leave empty to use your first name from display name.
                  </p>
                </div>

                <Button onClick={handleSaveProfile} disabled={isSaving} className="w-full">
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Save Profile
                    </>
                  )}
                </Button>
                {/* Danger zone: Delete account */}
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 mt-4">
                  <p className="text-sm font-medium text-red-600">Danger zone</p>
                  <p className="text-xs text-slate-500 mb-3">Permanently delete your account and all associated data.</p>
                  <Button
                    variant="destructive"
                    onClick={() => setIsDeleteDialogOpen(true)}
                    disabled={isDeletingAccount}
                    className="w-full"
                  >
                    {isDeletingAccount ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      "Delete Account"
                    )}
                  </Button>

                  <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Delete Account</DialogTitle>
                        <DialogDescription>
                          This will permanently delete your account and all associated data. To confirm, type your password below.
                        </DialogDescription>
                      </DialogHeader>

                      <div className="space-y-2 mt-4">
                        <Label>Enter your password to confirm</Label>
                        <Input type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} placeholder="Your password" />
                      </div>

                      <DialogFooter>
                        <Button variant="outline" onClick={() => { setIsDeleteDialogOpen(false); setDeletePassword("") }}>
                          Cancel
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={performDeleteAccount}
                          disabled={isDeletingAccount || !deletePassword}
                        >
                          {isDeletingAccount ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Deleting...
                            </>
                          ) : (
                            "Delete Account"
                          )}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Personalization Tab */}
          <TabsContent value="personalization" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>AI Personalization</CardTitle>
                <CardDescription>
                  Help the AI understand you better for personalized responses
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Gender */}
                <div className="space-y-3">
                  <Label>Gender</Label>
                  <RadioGroup value={gender} onValueChange={(value) => setGender(value as UserGender)}>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="boy" id="boy" />
                      <Label htmlFor="boy" className="font-normal">Boy</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="girl" id="girl" />
                      <Label htmlFor="girl" className="font-normal">Girl</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="other" id="other" />
                      <Label htmlFor="other" className="font-normal">Other/Prefer not to say</Label>
                    </div>
                  </RadioGroup>
                </div>

                {/* Age Group */}
                <div className="space-y-3">
                  <Label>Age Group</Label>
                  <Select value={age} onValueChange={(value) => setAge(value as UserAge)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="kid">Kid (under 13)</SelectItem>
                      <SelectItem value="teenage">Teen (13-19)</SelectItem>
                      <SelectItem value="mature">Adult (20-59)</SelectItem>
                      <SelectItem value="senior">Senior (60+)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Conversation Tone */}
                <div className="space-y-3">
                  <Label>Conversation Tone</Label>
                  <Select value={tone} onValueChange={(value) => setTone(value as ConversationTone)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="professional">Professional</SelectItem>
                      <SelectItem value="casual">Casual</SelectItem>
                      <SelectItem value="friendly">Friendly</SelectItem>
                      <SelectItem value="empathetic">Empathetic</SelectItem>
                      <SelectItem value="playful">Playful</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500">
                    Applied globally except in Best Friend Mode.
                  </p>
                </div>

                <Button onClick={handleSavePersonalization} disabled={isSaving} className="w-full">
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Save Personalization
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* AI Providers Tab */}
          <TabsContent value="providers" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>AI Provider API Keys</CardTitle>
                <CardDescription>
                  Configure your API keys for different AI providers
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {AI_PROVIDERS.map((provider) => (
                  <div key={provider.id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor={provider.id}>{provider.name}</Label>
                      {apiKeys[provider.id] && (
                        <Badge variant="secondary" className="text-xs">
                          <Check className="mr-1 h-3 w-3" />
                          Configured
                        </Badge>
                      )}
                    </div>
                    <div className="relative">
                      <Input
                        id={provider.id}
                        type={visibleKeys[provider.id] ? "text" : "password"}
                        value={apiKeys[provider.id] || ""}
                        onChange={(e) => updateApiKey(provider.id, e.target.value)}
                        placeholder={provider.placeholder}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-2 top-1/2 h-7 w-7 -translate-y-1/2"
                        onClick={() => toggleKeyVisibility(provider.id)}
                      >
                        {visibleKeys[provider.id] ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-slate-500">
                      {provider.id === "groq" || provider.id === "gemini"
                        ? "Optional: Uses built-in key by default. If you add your own, your key will be used. "
                        : null}
                      Get an API key from {" "}
                      <a href={provider.docsUrl} target="_blank" rel="noreferrer" className="text-cyan-600 underline">
                        {provider.docsUrl}
                      </a>
                    </p>
                    {provider.models?.length ? renderModelSelect(provider) : null}
                  </div>
                ))}

                <Button onClick={handleSaveAPIKeys} className="w-full">
                  <Save className="mr-2 h-4 w-4" />
                  Save API Keys
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Preferences Tab */}
          <TabsContent value="preferences" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>App Preferences</CardTitle>
                <CardDescription>
                  Customize your app experience
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Theme */}
                <div className="space-y-3">
                  <Label>Theme</Label>
                  <RadioGroup value={isMounted ? selectedTheme : "system"} onValueChange={(val) => { setSelectedTheme(val); setTheme(val); }}>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="light" id="light" />
                      <Label htmlFor="light" className="flex items-center gap-2 font-normal">
                        <Sun className="h-4 w-4" />
                        Light
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="dark" id="dark" />
                      <Label htmlFor="dark" className="flex items-center gap-2 font-normal">
                        <Moon className="h-4 w-4" />
                        Dark
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="system" id="system" />
                      <Label htmlFor="system" className="flex items-center gap-2 font-normal">
                        <Monitor className="h-4 w-4" />
                        System
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                {/* UI Style */}
                <div className="space-y-3">
                  <Label>UI Style</Label>
                  <RadioGroup value={uiStyle} onValueChange={(value) => setUIStyle(value as "modern" | "pixel")}>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="modern" id="modern" />
                      <Label htmlFor="modern" className="font-normal">Modern</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="pixel" id="pixel" />
                      <Label htmlFor="pixel" className="font-normal">Pixel/Retro</Label>
                    </div>
                  </RadioGroup>
                </div>

                {/* Voice */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Voice Responses</Label>
                    <p className="text-xs text-slate-500">
                      Enable AI voice responses
                    </p>
                  </div>
                  <Switch checked={voiceEnabled} onCheckedChange={setVoiceEnabled} />
                </div>

                {/* Sources & Citations */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="flex items-center gap-2">
                        <BookOpen className="h-4 w-4" />
                        Sources & Citations
                      </Label>
                      <p className="text-xs text-slate-500">
                        Show relevant documentation and Wikipedia links with AI responses
                      </p>
                    </div>
                    <Switch checked={sourcesEnabled} onCheckedChange={setSourcesEnabled} />
                  </div>
                  
                  {sourcesEnabled && (
                    <div className="pl-4 border-l-2 border-slate-200 dark:border-slate-700 space-y-3">
                      <Label className="text-sm">Source Type</Label>
                      <RadioGroup value={sourcesType} onValueChange={(val) => setSourcesType(val as "any" | "wikipedia" | "documentation")}>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="any" id="sources-any" />
                          <Label htmlFor="sources-any" className="font-normal">Any (Documentation, Wikipedia, Articles)</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="wikipedia" id="sources-wikipedia" />
                          <Label htmlFor="sources-wikipedia" className="font-normal">Wikipedia Only</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="documentation" id="sources-documentation" />
                          <Label htmlFor="sources-documentation" className="font-normal">Documentation Only</Label>
                        </div>
                      </RadioGroup>
                    </div>
                  )}
                </div>

              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
