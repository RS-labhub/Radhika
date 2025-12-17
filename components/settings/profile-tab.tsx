"use client"

import { useState, useEffect } from "react"
import { Upload, Loader2, User as UserIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useAuth } from "@/contexts/auth-context"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"

export function ProfileTab() {
  const { user } = useAuth()
  const [displayName, setDisplayName] = useState("")
  const [petName, setPetName] = useState("")
  const [gender, setGender] = useState<"boy" | "girl" | "other">("other")
  const [age, setAge] = useState<"kid" | "teenage" | "mature" | "senior">("teenage")
  const [avatarUrl, setAvatarUrl] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [deletePassword, setDeletePassword] = useState("")
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    if (user) {
      loadProfile()
    }
  }, [user])

  const loadProfile = async () => {
    if (!user) return

    try {
      const { data, error } = await supabase
        .from("users")
        .select("display_name, pet_name, avatar_url")
        .eq("id", user.id)
        .single()

      if (error) throw error
      if (data) {
        // Prefer DB value but fall back to auth metadata if absent
        const dbDisplay = (data as any).display_name
        const metaDisplay = (user as any).user_metadata?.display_name || (user as any).user_metadata?.name
        setDisplayName(dbDisplay ?? metaDisplay ?? "")
        setPetName((data as any).pet_name || "")
        setAvatarUrl((data as any).avatar_url || "")
      }

      // Load gender and age from user_settings
      const { data: settingsData, error: settingsError } = await supabase
        .from("user_settings")
        .select("gender, age")
        .eq("user_id", user.id)
        .single()

      if (!settingsError && settingsData) {
        setGender((settingsData as any).gender || "other")
        setAge((settingsData as any).age || "teenage")
      }
    } catch (err) {
      console.error("Failed to load profile:", err)
      // Fallback to auth metadata if DB lookup fails
      const metaDisplay = (user as any).user_metadata?.display_name || (user as any).user_metadata?.name
      if (metaDisplay) setDisplayName(metaDisplay)
    }
  }

  const handleSave = async () => {
    if (!user) return

    try {
      setIsLoading(true)
      // Update users table
      const { error: userError } = await supabase
        .from("users")
        // @ts-expect-error - Supabase types not generated
        .update({
          display_name: displayName,
          pet_name: petName,
          avatar_url: avatarUrl,
        })
        .eq("id", user.id)

      if (userError) throw userError

      // Update or insert user_settings
      const { error: settingsError } = await supabase
        .from("user_settings")
        // @ts-expect-error - Supabase types not generated
        .upsert({
          user_id: user.id,
          gender: gender,
          age: age,
        }, {
          onConflict: 'user_id'
        })

      if (settingsError) throw settingsError

      // Also update Supabase Auth user metadata so display_name stays in sync
      try {
        // supabase.auth.updateUser will update the logged-in user's metadata
        const { error: authError } = await supabase.auth.updateUser({ data: { display_name: displayName } } as any)
        if (authError) console.warn("Failed to update auth user metadata:", authError)
      } catch (err) {
        console.warn("Error updating auth metadata:", err)
      }

      toast.success("Profile updated successfully")
    } catch (err) {
      console.error("Failed to update profile:", err)
      toast.error("Failed to update profile")
    } finally {
      setIsLoading(false)
    }
  }

  const performDeleteAccount = async () => {
    if (!user) return

    if (!deletePassword) {
      toast.error("Please enter your password to confirm")
      return
    }

    try {
      setIsDeleting(true)

      // Re-authenticate user by signing in with password to verify it's correct
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
      if (!res.ok) {
        console.error("Server deletion failed:", json)
        throw new Error(json?.error || "Failed to delete account")
      }

      // Sign out client-side and redirect
      try {
        await supabase.auth.signOut()
      } catch {}
      toast.success("Account deleted")
      router.push("/")
    } catch (err) {
      console.error("Failed to delete account:", err)
      toast.error("Failed to delete account")
    } finally {
      setIsDeleting(false)
      setIsDeleteDialogOpen(false)
      setDeletePassword("")
    }
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return

    try {
      setIsUploading(true)
      
      // Upload to Supabase storage
      const fileExt = file.name.split(".").pop()
      const fileName = `${user.id}-${Date.now()}.${fileExt}`
      const filePath = `avatars/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { upsert: true })

      if (uploadError) throw uploadError

      // Get public URL
      const { data } = supabase.storage.from("avatars").getPublicUrl(filePath)
      
      setAvatarUrl(data.publicUrl)
      toast.success("Avatar uploaded")
    } catch (err) {
      console.error("Failed to upload avatar:", err)
      toast.error("Failed to upload avatar")
    } finally {
      setIsUploading(false)
    }
  }

  if (!user) {
    return (
      <div className="text-center py-8 text-slate-500">
        Please sign in to manage your profile
      </div>
    )
  }

  const initials = displayName
    ? displayName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
    : user.email?.slice(0, 2).toUpperCase() || "U"

  return (
    <div className="space-y-6">
      {/* Avatar Upload */}
      <div className="flex flex-col items-center gap-4">
        <Avatar className="h-24 w-24">
          <AvatarImage src={avatarUrl} alt={displayName || "User"} />
          <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
        </Avatar>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => document.getElementById("avatar-upload")?.click()}
            disabled={isUploading}
          >
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Upload Avatar
              </>
            )}
          </Button>
          <input
            id="avatar-upload"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarUpload}
          />
        </div>
      </div>

      {/* Email (read-only) */}
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={user.email || ""}
          disabled
          className="bg-slate-100 dark:bg-slate-800"
        />
        <p className="text-xs text-slate-500">
          Email cannot be changed
        </p>
      </div>

      {/* Display Name */}
      <div className="space-y-2">
        <Label htmlFor="displayName">Display Name</Label>
        <Input
          id="displayName"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Your name"
        />
      </div>

      {/* Pet Name / Nickname */}
      <div className="space-y-2">
        <Label htmlFor="petName">Nickname / Pet Name</Label>
        <Input
          id="petName"
          type="text"
          value={petName}
          onChange={(e) => setPetName(e.target.value)}
          placeholder="How you'd like to be called"
        />
        <p className="text-xs text-slate-500">
          Radhika will use this nickname when talking to you
        </p>
      </div>

      {/* Gender */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">Gender</Label>
        <RadioGroup value={gender} onValueChange={(value) => setGender(value as "boy" | "girl" | "other")}>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="boy" id="gender-boy" />
            <Label htmlFor="gender-boy" className="cursor-pointer font-normal">
              Boy
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="girl" id="gender-girl" />
            <Label htmlFor="gender-girl" className="cursor-pointer font-normal">
              Girl
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="other" id="gender-other" />
            <Label htmlFor="gender-other" className="cursor-pointer font-normal">
              Other / Prefer not to say
            </Label>
          </div>
        </RadioGroup>
        <p className="text-xs text-slate-500">
          Helps Radhika address you appropriately
        </p>
      </div>

      {/* Age Group */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">Age Group</Label>
        <RadioGroup value={age} onValueChange={(value) => setAge(value as "kid" | "teenage" | "mature" | "senior")}>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="kid" id="age-kid" />
            <Label htmlFor="age-kid" className="cursor-pointer font-normal">
              Kid (6-12 years)
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="teenage" id="age-teenage" />
            <Label htmlFor="age-teenage" className="cursor-pointer font-normal">
              Teenager (13-19 years)
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="mature" id="age-mature" />
            <Label htmlFor="age-mature" className="cursor-pointer font-normal">
              Adult (20-59 years)
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="senior" id="age-senior" />
            <Label htmlFor="age-senior" className="cursor-pointer font-normal">
              Senior (60+ years)
            </Label>
          </div>
        </RadioGroup>
        <p className="text-xs text-slate-500">
          Radhika will adapt her communication style based on your age
        </p>
      </div>

      {/* Save Button */}
      <Button onClick={handleSave} disabled={isLoading} className="w-full">
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Saving...
          </>
        ) : (
          "Save Changes"
        )}
      </Button>

      {/* Danger zone: Delete account */}
      <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
        <p className="text-sm font-medium text-red-600">Danger zone</p>
        <p className="text-xs text-slate-500 mb-3">Permanently delete your account and all associated data.</p>
        <Button
          variant="destructive"
          onClick={() => setIsDeleteDialogOpen(true)}
          disabled={isDeleting}
          className="w-full"
        >
          {isDeleting ? (
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
                disabled={isDeleting || !deletePassword}
              >
                {isDeleting ? (
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
    </div>
  )
}
