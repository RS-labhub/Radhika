"use client"

import { useState, useEffect } from "react"
import { Sun, Moon, Monitor } from "lucide-react"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Switch } from "@/components/ui/switch"
import { useTheme } from "next-themes"
import { toast } from "sonner"
import { useAuth } from "@/contexts/auth-context"
import { createClient } from "@/lib/supabase/client"

export function PreferencesTab() {
  const { theme, setTheme } = useTheme()
  const { user } = useAuth()
  const supabase = createClient()
  const [isMounted, setIsMounted] = useState(false)
  const [selectedTheme, setSelectedTheme] = useState<string>("system")
  const [voiceEnabled, setVoiceEnabled] = useState(false)
  const [uiStyle, setUiStyle] = useState("modern")
  const [conversationTone, setConversationTone] = useState("friendly")

  useEffect(() => {
    setIsMounted(true)
    // initialize local selection to avoid hydration mismatch
    if (theme) setSelectedTheme(theme)
  }, [theme])

  useEffect(() => {
    loadPreferences()
  }, [])

  const loadPreferences = async () => {
    try {
      const voice = localStorage.getItem("voice_enabled") === "true"
      const style = localStorage.getItem("ui_style") || "modern"
      setVoiceEnabled(voice)
      setUiStyle(style)

      // Load conversation tone from database if authenticated
      const localTone = localStorage.getItem("conversation_tone")

      if (user) {
        const { data, error } = await supabase
          .from("user_settings")
          .select("personalization")
          .eq("user_id", user.id)
          .single()

        if (!error && data) {
          const personalization = (data as any).personalization
          if (personalization && typeof personalization === 'object' && personalization.tone) {
            setConversationTone(personalization.tone)
            // keep local storage in sync
            localStorage.setItem("conversation_tone", personalization.tone)
          } else if (localTone) {
            // DB has no tone but user has a local preference -> save it to DB
            try {
              await supabase
                .from("user_settings")
                // @ts-expect-error - Supabase types not generated
                .upsert({ user_id: user.id, personalization: { tone: localTone } }, { onConflict: 'user_id' })
              setConversationTone(localTone)
            } catch (e) {
              // ignore DB save errors
            }
          }
        } else if (localTone) {
          // No settings row found; create one with local tone
          try {
            await supabase
              .from("user_settings")
              // @ts-expect-error
              .upsert({ user_id: user.id, personalization: { tone: localTone } }, { onConflict: 'user_id' })
            setConversationTone(localTone)
          } catch (e) {
            // ignore
          }
        }
      } else if (localTone) {
        // Not authenticated — use local preference
        setConversationTone(localTone)
      }
    } catch (e) {
      // Ignore storage errors
    }
  }

  const handleVoiceToggle = (enabled: boolean) => {
    try {
      setVoiceEnabled(enabled)
      localStorage.setItem("voice_enabled", String(enabled))
      toast.success(`Voice ${enabled ? "enabled" : "disabled"}`)
    } catch (e) {
      toast.error("Failed to save preference")
    }
  }

  const handleThemeChange = (newTheme: string) => {
    setSelectedTheme(newTheme)
    setTheme(newTheme)
    toast.success(`Theme changed to ${newTheme}`)
  }

  const handleStyleChange = (newStyle: string) => {
    try {
      setUiStyle(newStyle)
      localStorage.setItem("ui_style", newStyle)
      toast.success(`UI style changed to ${newStyle}`)
    } catch (e) {
      toast.error("Failed to save preference")
    }
  }

  const handleToneChange = async (newTone: string) => {
    try {
      setConversationTone(newTone)
      // Always persist locally so it can be synced after login
      try { localStorage.setItem("conversation_tone", newTone) } catch {}
      
      // Save to database if authenticated
      if (user) {
        const { error } = await supabase
          .from("user_settings")
          // @ts-expect-error - Supabase types not generated
          .upsert({
            user_id: user.id,
            personalization: { tone: newTone }
          }, {
            onConflict: 'user_id'
          })

        if (error) throw error
      }

      toast.success(`Conversation tone changed to ${newTone}`)
    } catch (e) {
      toast.error("Failed to save conversation tone")
    }
  }

  return (
    <div className="space-y-6">
      {/* Theme */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">Theme</Label>
  <RadioGroup value={isMounted ? selectedTheme : "system"} onValueChange={handleThemeChange}>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="light" id="light" />
            <Label htmlFor="light" className="flex items-center gap-2 cursor-pointer font-normal">
              <Sun className="h-4 w-4" />
              Light
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="dark" id="dark" />
            <Label htmlFor="dark" className="flex items-center gap-2 cursor-pointer font-normal">
              <Moon className="h-4 w-4" />
              Dark
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="system" id="system" />
            <Label htmlFor="system" className="flex items-center gap-2 cursor-pointer font-normal">
              <Monitor className="h-4 w-4" />
              System
            </Label>
          </div>
        </RadioGroup>
      </div>

      {/* UI Style */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">UI Style</Label>
        <RadioGroup value={uiStyle} onValueChange={handleStyleChange}>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="modern" id="modern" />
            <Label htmlFor="modern" className="cursor-pointer font-normal">
              Modern (Default)
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="pixel" id="pixel" />
            <Label htmlFor="pixel" className="cursor-pointer font-normal">
              Pixel Art
            </Label>
          </div>
        </RadioGroup>
        <p className="text-xs text-slate-500">
          Changing UI style will reload the page
        </p>
      </div>

      {/* Voice Features */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-base font-semibold">Voice Features</Label>
            <p className="text-xs text-slate-500">
              Enable text-to-speech for AI responses
            </p>
          </div>
          <Switch
            checked={voiceEnabled}
            onCheckedChange={handleVoiceToggle}
          />
        </div>
      </div>

      {/* Conversation Tone */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">Conversation Tone</Label>
        <RadioGroup value={conversationTone} onValueChange={handleToneChange}>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="professional" id="tone-professional" />
            <Label htmlFor="tone-professional" className="cursor-pointer font-normal">
              Professional
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="casual" id="tone-casual" />
            <Label htmlFor="tone-casual" className="cursor-pointer font-normal">
              Casual
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="friendly" id="tone-friendly" />
            <Label htmlFor="tone-friendly" className="cursor-pointer font-normal">
              Friendly (Default)
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="empathetic" id="tone-empathetic" />
            <Label htmlFor="tone-empathetic" className="cursor-pointer font-normal">
              Empathetic
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="playful" id="tone-playful" />
            <Label htmlFor="tone-playful" className="cursor-pointer font-normal">
              Playful
            </Label>
          </div>
        </RadioGroup>
        <p className="text-xs text-slate-500">
          Choose how Radhika should communicate with you (only applies in non-BFF modes)
        </p>
      </div>

      {/* Info */}
      <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
        <p className="text-xs text-slate-500">
          Preferences are saved locally in your browser
        </p>
      </div>
    </div>
  )
}
