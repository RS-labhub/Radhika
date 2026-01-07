"use client"

import { useState } from "react"
import { User, Key, Settings as SettingsIcon, Image as ImageIcon } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { ProfileTab } from "../settings/profile-tab"
import { ProvidersTab } from "../settings/providers-tab"
import { PreferencesTab } from "../settings/preferences-tab"

interface EnhancedSettingsDialogProps {
  children?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function EnhancedSettingsDialog({ children, open, onOpenChange }: EnhancedSettingsDialogProps) {
  const [activeTab, setActiveTab] = useState("profile")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Manage your profile, AI providers, and preferences
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="profile" className="gap-2">
              <User className="h-4 w-4" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="providers" className="gap-2">
              <Key className="h-4 w-4" />
              AI Providers
            </TabsTrigger>
            <TabsTrigger value="preferences" className="gap-2">
              <SettingsIcon className="h-4 w-4" />
              Preferences
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto mt-4">
            <TabsContent value="profile" className="mt-0">
              <ProfileTab />
            </TabsContent>

            <TabsContent value="providers" className="mt-0">
              <ProvidersTab />
            </TabsContent>

            <TabsContent value="preferences" className="mt-0">
              <PreferencesTab />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
