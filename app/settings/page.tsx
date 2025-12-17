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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
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
  UserCircle
} from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
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
]

const CUSTOM_MODEL_OPTION = "custom:__user_defined__"

export default function SettingsPage() {
  const { user, isLoading: authLoading } = useAuth()
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const supabase = createClient()
  const avatarBucket = process.env.NEXT_PUBLIC_SUPABASE_AVATAR_BUCKET || "avatars"
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [deletePassword, setDeletePassword] = useState("")
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)

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
  const [uiStyle, setUIStyle] = useState<"modern" | "pixel">("modern")
  const [isMounted, setIsMounted] = useState(false)
  const [selectedTheme, setSelectedTheme] = useState<string>("system")

  // Resolve stored avatar references (full URL or storage path) into a usable URL
  const resolveAvatarUrl = async (stored: string) => {
    if (!stored) return ""
    // Already a full URL
    if (stored.startsWith("http")) return stored

    // Stored as a path inside the bucket: create a long-lived signed URL (1 year)
    const { data: signed, error: signedError } = await supabase.storage
      .from(avatarBucket)
      .createSignedUrl(stored, 60 * 60 * 24 * 365)

    if (!signedError && signed?.signedUrl) return signed.signedUrl

    // Fallback to public URL (works if bucket is public)
    const { data: publicData } = supabase.storage
      .from(avatarBucket)
      .getPublicUrl(stored)

    return publicData.publicUrl
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

  useEffect(() => {
    const loadSettings = async () => {
      if (!user) {
        setIsLoading(false)
        return
      }

      if (hasLoadedOnce) return // Prevent re-fetching

      try {
        setIsLoading(true)

        // Set email first (always available from auth)
        setEmail(user.email || "")

        // Load user profile from users table
        const { data: userData, error: userError } = await (supabase.from("users") as any)
          .select("display_name, pet_name, avatar_url")
          .eq("id", user.id)
          .single()

        if (userError) {
          console.error("Error loading user data:", userError)
          // Continue anyway - user might not have a profile yet
        } else if (userData) {
          // Prefer DB value but fall back to auth metadata if absent
          const dbDisplay = userData.display_name
          const metaDisplay = (user as any).user_metadata?.display_name || (user as any).user_metadata?.name
          setDisplayName(dbDisplay ?? metaDisplay ?? "")
          setPetName(userData.pet_name || "")
          if (userData.avatar_url) {
            resolveAvatarUrl(userData.avatar_url)
              .then(setAvatarUrl)
              .catch((e) => {
                console.warn("Failed to resolve avatar URL", e)
                setAvatarUrl(userData.avatar_url)
              })
          }
        }

        // Load user personalization
        const { data: personalizationData, error: personalizationError } = await (supabase.from("user_settings") as any)
          .select("personalization")
          .eq("user_id", user.id)
          .single()

        if (personalizationError) {
          // Log a warning instead of console.error to avoid Next dev overlay treating this as an unhandled client error.
          console.warn("Warning loading personalization:", personalizationError)
          // Continue anyway - settings might not exist yet
        } else if (personalizationData) {
          const loadedGender = personalizationData.personalization?.gender
          setGender(["boy", "girl", "other"].includes(loadedGender) ? loadedGender : "other")
          const loadedAge = personalizationData.personalization?.age
          setAge(["kid", "teenage", "mature", "senior"].includes(loadedAge) ? loadedAge : "teenage")
          const loadedTone = personalizationData.personalization?.tone
          setTone(["professional", "casual", "friendly", "empathetic", "playful"].includes(loadedTone) ? loadedTone : "friendly")
        }

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
        
        if (storedVoice !== null) setVoiceEnabled(storedVoice === "true")
        if (storedUIStyle) setUIStyle(storedUIStyle as "modern" | "pixel")

        setHasLoadedOnce(true)
      } catch (err) {
        console.error("Failed to load settings:", err)
        // Still mark as loaded to prevent infinite loading
        setHasLoadedOnce(true)
      } finally {
        setIsLoading(false)
      }
    }

    loadSettings()
  }, [user, supabase, hasLoadedOnce])

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

      // Get previous avatar path for cleanup
      let previousAvatarPath: string | null = null
      const { data: existingProfile } = await (supabase.from("users") as any)
        .select("avatar_url")
        .eq("id", user.id)
        .single()
      if (existingProfile?.avatar_url) {
        previousAvatarPath = extractStoragePath(existingProfile.avatar_url)
      }

      // Upload to Supabase Storage
      const fileExt = file.name.split('.').pop()
      const fileName = `${user.id}-${Date.now()}.${fileExt}`
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(avatarBucket)
        .upload(fileName, file, { upsert: true })

      if (uploadError) throw uploadError

      const storagePath = uploadData?.path || fileName

      // Prefer a signed URL (works for private buckets); fall back to public URL
      const { data: signed, error: signedError } = await supabase.storage
        .from(avatarBucket)
        .createSignedUrl(storagePath, 60 * 60 * 24 * 365)

      const { data: { publicUrl } } = supabase.storage
        .from(avatarBucket)
        .getPublicUrl(storagePath)

      const finalUrl = (!signedError && signed?.signedUrl) ? signed.signedUrl : publicUrl

      // Update user profile (store the storage path; UI will resolve to signed/public URL)
      const { error: updateError } = await (supabase.from('users') as any)
        .update({ avatar_url: storagePath })
        .eq('id', user.id)

      if (updateError) throw updateError

      setAvatarUrl(finalUrl)

      // Delete previous avatar file if it existed
      if (previousAvatarPath) {
        const { error: removeError } = await supabase.storage
          .from(avatarBucket)
          .remove([previousAvatarPath])
        if (removeError) {
          console.warn("Failed to remove previous avatar", removeError)
        }
      }
    } catch (err) {
      console.error("Avatar upload error:", err)
      const message = err instanceof Error ? err.message : "Failed to upload avatar"
      if (message.includes("Bucket not found")) {
        console.error("Avatar bucket not found. Please create the bucket in Supabase (see README).")
      } else {
        console.error(message)
      }
    } finally {
      setIsUploadingAvatar(false)
    }
  }

  const handleSaveProfile = async () => {
    if (!user) return

    try {
      setIsSaving(true)

      const { error } = await (supabase.from("users") as any)
        .update({
          display_name: displayName.trim(),
          pet_name: petName.trim() || null,
        })
        .eq("id", user.id)

      if (error) throw error
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

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email || "",
        password: deletePassword,
      } as any)

      if (signInError) {
        console.error("Re-authentication failed:", signInError)
        toast.error("Incorrect password")
        return
      }

      const res = await fetch("/api/delete-account", { method: "POST" })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Failed to delete account")
      try { await supabase.auth.signOut() } catch {}
      toast.success("Account deleted")
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

      // Upsert user settings
      const personalization = { gender, age, tone }

      const { error } = await (supabase.from("user_settings") as any)
        .upsert(
          {
            user_id: user.id,
            personalization,
          },
          {
            onConflict: "user_id",
          }
        )

      if (error) throw error

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
    try {
      localStorage.setItem("voice_enabled", String(voiceEnabled))
      localStorage.setItem("ui_style", uiStyle)
    } catch (err) {
      console.error("Failed to save preferences:", err)
    }
  }, [voiceEnabled, uiStyle])

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

              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
