"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { useFeatureAccess } from "@/hooks/use-feature-access"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { 
  MessageSquare, 
  User, 
  Settings, 
  Star, 
  Clock, 
  ArrowRight,
  Brain,
  Heart,
  BookOpen,
  Lightbulb,
  Target,
  Users,
  LogOut,
  ChevronRight
} from "lucide-react"
import { cn } from "@/lib/utils"
import { getRecentChats, getChatStats } from "@/lib/services/chats"
import { getProfiles } from "@/lib/services/profiles"
import type { Chat, ChatProfile } from "@/types/database"

const MODE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  general: Brain,
  productivity: Target,
  wellness: Heart,
  learning: BookOpen,
  creative: Lightbulb,
  bff: Users,
}

const MODE_COLORS: Record<string, string> = {
  general: "text-cyan-600 dark:text-cyan-400",
  productivity: "text-emerald-600 dark:text-emerald-400",
  wellness: "text-rose-600 dark:text-rose-400",
  learning: "text-purple-600 dark:text-purple-400",
  creative: "text-amber-600 dark:text-amber-400",
  bff: "text-pink-600 dark:text-pink-400",
}

export default function DashboardPage() {
  const { user, profile, isLoading: authLoading, signOut } = useAuth()
  const { isAuthenticated } = useFeatureAccess()
  const router = useRouter()
  
  const [recentChats, setRecentChats] = useState<Chat[]>([])
  const [profiles, setProfiles] = useState<ChatProfile[]>([])
  const [stats, setStats] = useState<{
    totalChats: number
    totalMessages: number
    chatsByMode: Record<string, number>
  } | null>(null)
  const [isLoading, setIsLoading] = useState(false) // Start with false, not true
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/auth/login?redirectTo=/dashboard")
    }
  }, [authLoading, isAuthenticated, router])

  useEffect(() => {
    const fetchData = async () => {
      if (!user?.id) {
        setIsLoading(false)
        return
      }

      if (hasLoadedOnce && !loadError) return // Prevent re-fetching unless there was an error

      try {
        setIsLoading(true)
        setLoadError(false)
        
        // Set a safety timeout to ensure loading never hangs forever
        const safetyTimeout = setTimeout(() => {
          console.warn("Dashboard load taking too long, clearing loading state")
          setIsLoading(false)
          setLoadError(true)
        }, 30000) // 30 seconds max
        
        const [chatsData, profilesData, statsData] = await Promise.all([
          getRecentChats(user.id, 5),
          getProfiles(user.id),
          getChatStats(user.id),
        ])

        clearTimeout(safetyTimeout)
        setRecentChats(chatsData)
        setProfiles(profilesData)
        setStats(statsData)
        setHasLoadedOnce(true)
      } catch (error) {
        console.error("Failed to fetch dashboard data:", error)
        setLoadError(true)
        // Don't mark as loaded on error - allow retry
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [user?.id, hasLoadedOnce])

  const handleSignOut = async () => {
    await signOut()
    router.push("/")
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-600" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-600" />
      </div>
    )
  }

  const displayName = profile?.display_name || user?.email?.split("@")[0] || "User"
  const initials = (profile?.display_name || user?.email?.split("@")[0] || "User").slice(0, 2).toUpperCase()

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.12),_transparent_55%),radial-gradient(circle_at_bottom,_rgba(139,92,246,0.1),_transparent_55%)]" />
      
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14 border-2 border-white shadow-lg">
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback className="bg-gradient-to-br from-cyan-500 to-blue-600 text-white text-lg">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                Welcome back, {displayName}!
              </h1>
              <p className="text-slate-500 dark:text-slate-400">
                {profile?.role === "premium" ? "Premium Member" : "Member"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="outline" className="gap-2">
                <MessageSquare className="h-4 w-4" />
                Chat
              </Button>
            </Link>
            <Button variant="ghost" size="icon" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-3 mb-8">
          <Card className="border-white/60 dark:border-white/10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400">
                Total Chats
              </CardTitle>
              <MessageSquare className="h-4 w-4 text-slate-400" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold text-slate-900 dark:text-white">
                  {stats?.totalChats || 0}
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="border-white/60 dark:border-white/10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400">
                Messages Sent
              </CardTitle>
              <MessageSquare className="h-4 w-4 text-slate-400" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold text-slate-900 dark:text-white">
                  {stats?.totalMessages || 0}
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="border-white/60 dark:border-white/10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400">
                Active Profiles
              </CardTitle>
              <User className="h-4 w-4 text-slate-400" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold text-slate-900 dark:text-white">
                  {profiles.length}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Recent Chats */}
          <Card className="border-white/60 dark:border-white/10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-cyan-600" />
                Recent Chats
              </CardTitle>
              <CardDescription>Your latest conversations</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : recentChats.length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare className="h-12 w-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                  <p className="text-slate-500 dark:text-slate-400">No chats yet</p>
                  <Link href="/">
                    <Button className="mt-4" size="sm">
                      Start chatting
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentChats.map((chat) => {
                    const ModeIcon = MODE_ICONS[chat.mode] || Brain
                    return (
                      <Link key={chat.id} href={`/?chatId=${chat.id}`}>
                        <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group">
                          <div className={cn(
                            "p-2 rounded-lg bg-slate-100 dark:bg-slate-800",
                            MODE_COLORS[chat.mode]
                          )}>
                            <ModeIcon className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-slate-900 dark:text-white truncate">
                              {chat.title}
                            </p>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                              {new Date(chat.last_message_at || chat.created_at).toLocaleDateString()}
                            </p>
                          </div>
                          <ChevronRight className="h-4 w-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Chat Profiles */}
          <Card className="border-white/60 dark:border-white/10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5 text-purple-600" />
                Your Profiles
              </CardTitle>
              <CardDescription>Quick access to your chat profiles</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : profiles.length === 0 ? (
                <div className="text-center py-8">
                  <User className="h-12 w-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                  <p className="text-slate-500 dark:text-slate-400">No profiles yet</p>
                  <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
                    Create profiles in chat to organize your conversations
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {profiles.map((chatProfile) => {
                    const ModeIcon = MODE_ICONS[chatProfile.mode] || Brain
                    return (
                      <Link key={chatProfile.id} href={`/?profileId=${chatProfile.id}&mode=${chatProfile.mode}`}>
                        <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group">
                          <div className={cn(
                            "p-2 rounded-lg bg-slate-100 dark:bg-slate-800",
                            MODE_COLORS[chatProfile.mode]
                          )}>
                            <ModeIcon className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-slate-900 dark:text-white truncate">
                              {chatProfile.name}
                            </p>
                            <p className="text-sm text-slate-500 dark:text-slate-400 capitalize">
                              {chatProfile.mode} mode
                            </p>
                          </div>
                          <Badge variant="secondary" className="text-xs capitalize">
                            {chatProfile.mode}
                          </Badge>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Usage by Mode */}
          <Card className="border-white/60 dark:border-white/10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Star className="h-5 w-5 text-amber-500" />
                Usage by Mode
              </CardTitle>
              <CardDescription>Your chat activity across different modes</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  {[...Array(6)].map((_, i) => (
                    <Skeleton key={i} className="h-24" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  {Object.entries(MODE_ICONS).map(([mode, Icon]) => {
                    const count = stats?.chatsByMode[mode] || 0
                    return (
                      <Link key={mode} href={`/?mode=${mode}`}>
                        <div className={cn(
                          "p-4 rounded-xl border text-center hover:shadow-md transition-all cursor-pointer",
                          "border-slate-200 dark:border-slate-700",
                          "hover:border-slate-300 dark:hover:border-slate-600"
                        )}>
                          <Icon className={cn("h-6 w-6 mx-auto mb-2", MODE_COLORS[mode])} />
                          <p className="font-semibold text-lg text-slate-900 dark:text-white">
                            {count}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">
                            {mode}
                          </p>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
