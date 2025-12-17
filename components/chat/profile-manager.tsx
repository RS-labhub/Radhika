"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { 
  Plus, 
  MoreHorizontal, 
  Pencil, 
  Trash2, 
  ChevronDown, 
  ChevronRight,
  User,
  Loader2,
  AlertCircle
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/auth-context"
import { useFeatureAccess } from "@/hooks/use-feature-access"
import { 
  getProfilesByMode, 
  createProfile, 
  renameProfile, 
  deleteProfile,
  canCreateProfile 
} from "@/lib/services/profiles"
import type { ChatProfile } from "@/types/database"
import type { Mode, ModeDefinition } from "@/types/chat"

interface ProfileManagerProps {
  mode: Mode
  modeDefinition: ModeDefinition
  selectedProfileId: string | null
  onSelectProfile: (profileId: string | null) => void
  isPixel?: boolean
}

export function ProfileManager({
  mode,
  modeDefinition,
  selectedProfileId,
  onSelectProfile,
  isPixel = false,
}: ProfileManagerProps) {
  const { user } = useAuth()
  const { canUseProfiles } = useFeatureAccess()
  const [profiles, setProfiles] = useState<ChatProfile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isExpanded, setIsExpanded] = useState(true)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [selectedProfile, setSelectedProfile] = useState<ChatProfile | null>(null)
  const [newProfileName, setNewProfileName] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch profiles for the current mode
  useEffect(() => {
    const fetchProfiles = async () => {
      if (!user?.id || !canUseProfiles) {
        setProfiles([])
        setIsLoading(false)
        return
      }

      try {
        const data = await getProfilesByMode(user.id, mode)
        setProfiles(data)
      } catch (err) {
        console.error("Failed to fetch profiles:", err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchProfiles()
  }, [user?.id, mode, canUseProfiles])

  const handleCreateProfile = async () => {
    if (!user?.id || !newProfileName.trim()) return

    setIsSaving(true)
    setError(null)

    try {
      const profile = await createProfile(user.id, mode, newProfileName.trim())
      setProfiles(prev => [...prev, profile])
      setNewProfileName("")
      setIsCreateDialogOpen(false)
      onSelectProfile(profile.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create profile")
    } finally {
      setIsSaving(false)
    }
  }

  const handleRenameProfile = async () => {
    if (!selectedProfile || !newProfileName.trim()) return

    setIsSaving(true)
    setError(null)

    try {
      const updated = await renameProfile(selectedProfile.id, newProfileName.trim())
      setProfiles(prev => prev.map(p => p.id === updated.id ? updated : p))
      setNewProfileName("")
      setIsRenameDialogOpen(false)
      setSelectedProfile(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename profile")
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteProfile = async () => {
    if (!selectedProfile) return

    setIsSaving(true)
    setError(null)

    try {
      await deleteProfile(selectedProfile.id)
      setProfiles(prev => prev.filter(p => p.id !== selectedProfile.id))
      if (selectedProfileId === selectedProfile.id) {
        onSelectProfile(null)
      }
      setIsDeleteDialogOpen(false)
      setSelectedProfile(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete profile")
    } finally {
      setIsSaving(false)
    }
  }

  const openRenameDialog = (profile: ChatProfile) => {
    setSelectedProfile(profile)
    setNewProfileName(profile.name)
    setIsRenameDialogOpen(true)
  }

  const openDeleteDialog = (profile: ChatProfile) => {
    setSelectedProfile(profile)
    setIsDeleteDialogOpen(true)
  }

  if (!canUseProfiles) {
    return null
  }

  const ModeIcon = modeDefinition.icon
  const canCreate = canCreateProfile(profiles.length)

  return (
    <>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className={cn(
              "w-full justify-between px-3 py-2 h-auto",
              isPixel
                ? "pixel-tile text-slate-700 dark:text-slate-200"
                : "rounded-xl border border-slate-200/50 bg-slate-50/50 hover:bg-slate-100/70 dark:border-slate-700/50 dark:bg-slate-800/50 dark:hover:bg-slate-700/50"
            )}
          >
            <div className="flex items-center gap-2">
              <ModeIcon className={cn("h-4 w-4", modeDefinition.color)} />
              <span className="font-medium text-sm">Profiles</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                ({profiles.length}/3)
              </span>
            </div>
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronRight className="h-4 w-4 text-slate-400" />
            )}
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-2 space-y-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
            </div>
          ) : (
            <>
              {/* Default (no profile) option */}
              <Button
                variant="ghost"
                onClick={() => onSelectProfile(null)}
                className={cn(
                  "w-full justify-start gap-2 h-9",
                  isPixel
                    ? "pixel-tile text-slate-600 dark:text-slate-300"
                    : "rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800",
                  selectedProfileId === null && (
                    isPixel
                      ? "bg-slate-200/60 dark:bg-slate-700/60"
                      : "bg-slate-100 dark:bg-slate-800"
                  )
                )}
              >
                <User className="h-4 w-4 text-slate-400" />
                <span className="text-sm">Default</span>
              </Button>

              {/* Profile list */}
              {profiles.map((profile) => (
                <div
                  key={profile.id}
                  className={cn(
                    "flex items-center gap-1 group",
                    isPixel
                      ? "pixel-tile"
                      : "rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800",
                    selectedProfileId === profile.id && (
                      isPixel
                        ? "bg-slate-200/60 dark:bg-slate-700/60"
                        : "bg-slate-100 dark:bg-slate-800"
                    )
                  )}
                >
                  <Button
                    variant="ghost"
                    onClick={() => onSelectProfile(profile.id)}
                    className="flex-1 justify-start gap-2 h-9 px-3"
                  >
                    <User className={cn("h-4 w-4", modeDefinition.color)} />
                    <span className="text-sm truncate">{profile.name}</span>
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openRenameDialog(profile)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={() => openDeleteDialog(profile)}
                        className="text-red-600 dark:text-red-400"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}

              {/* Create new profile button */}
              {canCreate && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setNewProfileName("")
                    setError(null)
                    setIsCreateDialogOpen(true)
                  }}
                  className={cn(
                    "w-full justify-start gap-2 h-9",
                    isPixel
                      ? "pixel-tile text-slate-500 dark:text-slate-400"
                      : "rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  )}
                >
                  <Plus className="h-4 w-4" />
                  <span className="text-sm">New Profile</span>
                </Button>
              )}
            </>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* Create Profile Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Profile</DialogTitle>
            <DialogDescription>
              Create a new profile for {modeDefinition.label} mode. You can have up to 3 profiles per mode.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="profile-name">Profile Name</Label>
              <Input
                id="profile-name"
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                placeholder="e.g., Work, Personal, Study"
                maxLength={50}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateProfile}
              disabled={isSaving || !newProfileName.trim()}
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Profile"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Profile Dialog */}
      <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Profile</DialogTitle>
            <DialogDescription>
              Enter a new name for this profile.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="rename-profile">Profile Name</Label>
              <Input
                id="rename-profile"
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                placeholder="Enter new name"
                maxLength={50}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRenameDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleRenameProfile}
              disabled={isSaving || !newProfileName.trim()}
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Profile Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Profile</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{selectedProfile?.name}&quot;? This action cannot be undone. All chat history associated with this profile will also be deleted.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={handleDeleteProfile}
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
