"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { User, Plus, Check, Edit2, Trash2 } from "lucide-react"
import type { ChatProfile } from "@/types/database"
import type { Mode } from "@/types/chat"
import { getProfilesByMode, createProfile, updateProfile, deleteProfile } from "@/lib/services/profiles"
import { useAuth } from "@/contexts/auth-context"
import { useToast } from "@/hooks/use-toast"

interface ProfileSelectorProps {
  mode: Mode
  currentProfileId?: string | null
  onProfileSelect: (profileId: string | null) => void
  uiStyle?: "modern" | "pixel"
  className?: string
}

export function ProfileSelector({
  mode,
  currentProfileId,
  onProfileSelect,
  uiStyle = "modern",
  className,
}: ProfileSelectorProps) {
  const { user } = useAuth()
  const { toast } = useToast()
  const [profiles, setProfiles] = useState<ChatProfile[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [newProfileName, setNewProfileName] = useState("")
  const [isCreating, setIsCreating] = useState(false)

  const isPixel = uiStyle === "pixel"

  // Load profiles for current mode
  useEffect(() => {
    if (!user?.id) return

    const loadProfiles = async () => {
      setIsLoading(true)
      try {
        const data = await getProfilesByMode(user.id, mode)
        setProfiles(data)
      } catch (error) {
        console.error("Failed to load profiles:", error)
      } finally {
        setIsLoading(false)
      }
    }

    loadProfiles()
  }, [user?.id, mode])

  const handleCreateProfile = async () => {
    if (!user?.id || !newProfileName.trim()) return

    setIsCreating(true)
    try {
      const newProfile = await createProfile(user.id, mode, newProfileName.trim())
      setProfiles((prev) => [...prev, newProfile])
      setIsCreateDialogOpen(false)
      setNewProfileName("")
      onProfileSelect(newProfile.id)
      toast({
        title: "Profile created",
        description: `Created profile "${newProfile.name}"`,
      })
    } catch (error: any) {
      console.error("Failed to create profile:", error)
      toast({
        title: "Failed to create profile",
        description: error.message || "An error occurred",
        variant: "destructive",
      })
    } finally {
      setIsCreating(false)
    }
  }

  const handleDeleteProfile = async (profileId: string, profileName: string) => {
    try {
      // Deleting a profile will cascade delete all associated chats (handled by database)
      await deleteProfile(profileId)
      setProfiles((prev) => prev.filter((p) => p.id !== profileId))
      if (currentProfileId === profileId) {
        onProfileSelect(null)
      }
      toast({
        title: "Profile deleted",
        description: `Deleted profile "${profileName}" and all associated chats`,
      })
    } catch (error: any) {
      console.error("Failed to delete profile:", error)
      toast({
        title: "Failed to delete profile",
        description: error.message || "An error occurred",
        variant: "destructive",
      })
    }
  }

  const currentProfile = profiles.find((p) => p.id === currentProfileId)

  const buttonClass = cn(
    "gap-2",
    isPixel
      ? "pixel-control text-slate-700 dark:text-slate-200"
      : "border-white/40 bg-white/70 hover:bg-white dark:border-white/10 dark:bg-slate-900/60 dark:hover:bg-slate-800/80",
    className
  )

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={buttonClass}
          >
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">
              {currentProfile ? currentProfile.name : "No Profile"}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className={cn(
            "w-64",
            isPixel && "pixel-panel border-2"
          )}
        >
          <DropdownMenuLabel className="flex items-center justify-between">
            <span>Chat Profiles</span>
            <Badge variant="secondary" className="text-xs capitalize">
              {mode}
            </Badge>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          
          {/* No Profile Option */}
          <DropdownMenuItem
            onClick={() => onProfileSelect(null)}
            className="flex items-center justify-between"
          >
            <span>No Profile (Default)</span>
            {!currentProfileId && <Check className="h-4 w-4" />}
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          
          {/* Existing Profiles */}
          {isLoading ? (
            <div className="px-2 py-4 text-center text-sm text-slate-500">
              Loading...
            </div>
          ) : profiles.length === 0 ? (
            <div className="px-2 py-4 text-center text-sm text-slate-500">
              No profiles yet
            </div>
          ) : (
            profiles.map((profile) => (
              <DropdownMenuItem
                key={profile.id}
                onClick={() => onProfileSelect(profile.id)}
                className="flex items-center justify-between group"
              >
                <span className="flex-1 truncate">{profile.name}</span>
                <div className="flex items-center gap-1">
                  {currentProfileId === profile.id && (
                    <Check className="h-4 w-4 text-green-600" />
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteProfile(profile.id, profile.name)
                    }}
                  >
                    <Trash2 className="h-3 w-3 text-red-500" />
                  </Button>
                </div>
              </DropdownMenuItem>
            ))
          )}
          
          <DropdownMenuSeparator />
          
          {/* Create New Profile */}
          <DropdownMenuItem
            onClick={() => setIsCreateDialogOpen(true)}
            disabled={profiles.length >= 3}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            <span>Create New Profile</span>
          </DropdownMenuItem>
          
          {profiles.length >= 3 && (
            <div className="px-2 py-2 text-xs text-slate-500 text-center">
              Max 3 profiles per mode
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Create Profile Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className={cn(isPixel && "pixel-panel border-2")}>
          <DialogHeader>
            <DialogTitle>Create Chat Profile</DialogTitle>
            <DialogDescription>
              Create a new profile for {mode} mode. You can have up to 3 profiles per mode.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="profile-name">Profile Name</Label>
              <Input
                id="profile-name"
                placeholder="e.g., Work, Personal, Study"
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newProfileName.trim()) {
                    handleCreateProfile()
                  }
                }}
                className={cn(isPixel && "pixel-input")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateDialogOpen(false)
                setNewProfileName("")
              }}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateProfile}
              disabled={!newProfileName.trim() || isCreating}
            >
              {isCreating ? "Creating..." : "Create Profile"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
