"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { useAdminStatus } from "@/hooks/use-admin-status"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { UserAvatar, Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/hooks/use-toast"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { 
  Users, 
  MessageSquare, 
  Trash2, 
  Eye, 
  Search,
  ChevronLeft,
  ChevronRight,
  Shield,
  AlertTriangle,
  Loader2,
  ArrowLeft,
  Home,
  Pencil,
  ImageOff
} from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { MODE_BADGE_COLORS } from "@/lib/constants"

interface UserWithStats {
  id: string
  email: string
  name: string
  labels: string[]
  createdAt: string
  lastActivity: string
  profile: {
    display_name: string | null
    avatar_url: string | null
    is_creator: boolean
  } | null
  stats: {
    chatCount: number
    messageCount: number
  }
}

interface ChatSummary {
  id: string
  mode: string
  title: string
  messageCount: number
  lastMessagePreview: string | null
  createdAt: string
  lastMessageAt: string | null
  isArchived: boolean
}

interface ChatMessage {
  id: string
  role: string
  content: string
  metadata: any
  createdAt: string
  isFavorite: boolean
}

export default function AdminPage() {
  const { user, isLoading: authLoading } = useAuth()
  const { isAdmin, isLoading: adminLoading } = useAdminStatus()
  const router = useRouter()
  const { toast } = useToast()

  const [users, setUsers] = useState<UserWithStats[]>([])
  const [totalUsers, setTotalUsers] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [searchQuery, setSearchQuery] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  
  // User detail view
  const [selectedUser, setSelectedUser] = useState<UserWithStats | null>(null)
  const [selectedUserChats, setSelectedUserChats] = useState<ChatSummary[]>([])
  const [isLoadingUserDetails, setIsLoadingUserDetails] = useState(false)
  
  // Edit user dialog
  const [editingUser, setEditingUser] = useState<UserWithStats | null>(null)
  const [editDisplayName, setEditDisplayName] = useState("")
  const [isSavingUser, setIsSavingUser] = useState(false)
  
  // Chat detail view
  const [selectedChat, setSelectedChat] = useState<ChatSummary | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [isLoadingChat, setIsLoadingChat] = useState(false)
  
  // Delete confirmations
  const [userToDelete, setUserToDelete] = useState<UserWithStats | null>(null)
  const [chatToDelete, setChatToDelete] = useState<ChatSummary | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Fetch users
  const fetchUsers = useCallback(async () => {
    if (!isAdmin || !user) return

    setIsLoading(true)
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: "20",
      })
      if (searchQuery) {
        params.set("search", searchQuery)
      }

      const response = await fetch(`/api/admin?${params.toString()}`, {
        headers: {
          'x-user-id': user.$id
        }
      })
      if (response.ok) {
        const data = await response.json()
        setUsers(data.users || [])
        setTotalUsers(data.total || 0)
        setTotalPages(data.totalPages || 1)
      } else {
        throw new Error("Failed to fetch users")
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch users",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }, [isAdmin, currentPage, searchQuery, toast, user])

  useEffect(() => {
    if (isAdmin) {
      fetchUsers()
    }
  }, [isAdmin, fetchUsers])

  // Fetch user details
  const fetchUserDetails = async (userId: string) => {
    if (!user) return
    setIsLoadingUserDetails(true)
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        headers: { 'x-user-id': user.$id }
      })
      if (response.ok) {
        const data = await response.json()
        setSelectedUserChats(data.chats || [])
      } else {
        throw new Error("Failed to fetch user details")
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch user details",
        variant: "destructive",
      })
    } finally {
      setIsLoadingUserDetails(false)
    }
  }

  // Fetch chat details
  const fetchChatDetails = async (chatId: string) => {
    if (!user) return
    setIsLoadingChat(true)
    try {
      const response = await fetch(`/api/admin/chats/${chatId}`, {
        headers: { 'x-user-id': user.$id }
      })
      if (response.ok) {
        const data = await response.json()
        setChatMessages(data.messages || [])
      } else {
        throw new Error("Failed to fetch chat details")
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch chat details",
        variant: "destructive",
      })
    } finally {
      setIsLoadingChat(false)
    }
  }

  // Delete user
  const handleDeleteUser = async () => {
    if (!userToDelete || !user) return

    setIsDeleting(true)
    try {
      const response = await fetch(`/api/admin/users/${userToDelete.id}`, {
        method: "DELETE",
        headers: { 'x-user-id': user.$id }
      })
      if (response.ok) {
        toast({
          title: "Success",
          description: "User deleted successfully",
        })
        setUserToDelete(null)
        setSelectedUser(null)
        fetchUsers()
      } else {
        const error = await response.json()
        throw new Error(error.error || "Failed to delete user")
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete user",
        variant: "destructive",
      })
    } finally {
      setIsDeleting(false)
    }
  }

  // Delete chat
  const handleDeleteChat = async () => {
    if (!chatToDelete || !user) return

    setIsDeleting(true)
    try {
      const response = await fetch(`/api/admin/chats/${chatToDelete.id}`, {
        method: "DELETE",
        headers: { 'x-user-id': user.$id }
      })
      if (response.ok) {
        toast({
          title: "Success",
          description: "Chat deleted successfully",
        })
        setChatToDelete(null)
        setSelectedChat(null)
        if (selectedUser) {
          fetchUserDetails(selectedUser.id)
        }
      } else {
        throw new Error("Failed to delete chat")
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete chat",
        variant: "destructive",
      })
    } finally {
      setIsDeleting(false)
    }
  }

  // Handle search
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setCurrentPage(1)
    fetchUsers()
  }

  // Auth loading state
  if (authLoading || adminLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-cyan-600" />
          <p className="text-slate-600 dark:text-slate-400">Checking access...</p>
        </div>
      </div>
    )
  }

  // Not authorized
  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <Card className="w-full max-w-md mx-4">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
              <Shield className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
            <CardTitle className="text-red-600 dark:text-red-400">Access Denied</CardTitle>
            <CardDescription>
              You don't have permission to access the admin panel.
              This area is restricted to reserved email addresses only.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Link href="/">
              <Button variant="outline">
                <Home className="h-4 w-4 mr-2" />
                Go Home
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
              </Link>
              <div className="flex items-center gap-2">
                <Shield className="h-6 w-6 text-cyan-600" />
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">Admin Panel</h1>
              </div>
            </div>
            <Badge variant="outline" className="text-cyan-600 border-cyan-300">
              Reserved Email Access
            </Badge>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">
                Total Users
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-cyan-600" />
                <span className="text-2xl font-bold">{totalUsers}</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">
                Total Chats
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-emerald-600" />
                <span className="text-2xl font-bold">
                  {users.reduce((sum, u) => sum + u.stats.chatCount, 0)}
                </span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">
                Total Messages
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-purple-600" />
                <span className="text-2xl font-bold">
                  {users.reduce((sum, u) => sum + u.stats.messageCount, 0)}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search by email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button type="submit">Search</Button>
            </form>
          </CardContent>
        </Card>

        {/* Users Table */}
        <Card>
          <CardHeader>
            <CardTitle>Users</CardTitle>
            <CardDescription>Manage all users and their data</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Chats</TableHead>
                      <TableHead>Messages</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <UserAvatar
                              avatarUrl={u.profile?.avatar_url}
                              name={u.profile?.display_name || u.name}
                              email={u.email}
                              size="sm"
                            />
                            <span className="font-medium">
                              {u.profile?.display_name || u.name || "Unknown"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-slate-600 dark:text-slate-400">
                          {u.email}
                        </TableCell>
                        <TableCell>{u.stats.chatCount}</TableCell>
                        <TableCell>{u.stats.messageCount}</TableCell>
                        <TableCell className="text-slate-600 dark:text-slate-400">
                          {new Date(u.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedUser(u)
                                fetchUserDetails(u.id)
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => setUserToDelete(u)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Page {currentPage} of {totalPages}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </main>

      {/* User Details Dialog */}
      <Dialog open={!!selectedUser} onOpenChange={(open) => {
        if (!open) {
          setSelectedUser(null)
          setSelectedChat(null)
          setChatMessages([])
        }
      }}>
        <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0">
          <DialogHeader className="flex-shrink-0 p-6 pb-4 border-b">
            <DialogTitle className="flex items-center gap-3">
              <UserAvatar
                avatarUrl={selectedUser?.profile?.avatar_url}
                name={selectedUser?.profile?.display_name || selectedUser?.name}
                email={selectedUser?.email}
                size="lg"
              />
              <div>
                <div className="text-lg">{selectedUser?.profile?.display_name || selectedUser?.name || "Unknown"}</div>
                <div className="text-sm font-normal text-slate-600 dark:text-slate-400">
                  {selectedUser?.email}
                </div>
              </div>
            </DialogTitle>
            <DialogDescription asChild>
              <div className="mt-2 flex gap-4 text-sm text-muted-foreground">
                <span><strong>{selectedUser?.stats.chatCount}</strong> chats</span>
                <span><strong>{selectedUser?.stats.messageCount}</strong> messages</span>
                <span>Joined: {selectedUser?.createdAt ? new Date(selectedUser.createdAt).toLocaleDateString() : 'N/A'}</span>
              </div>
            </DialogDescription>
          </DialogHeader>

          {/* Two-panel layout: chats list and messages */}
          <div className="flex-1 flex overflow-hidden min-h-0">
            {/* Left panel - Chat list */}
            <div className={cn(
              "border-r border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col",
              selectedChat ? "w-1/3" : "w-full"
            )}>
              <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
                <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">Chat History</h3>
              </div>
              <ScrollArea className="flex-1">
                {isLoadingUserDetails ? (
                  <div className="space-y-3 p-3">
                    {[...Array(3)].map((_, i) => (
                      <Skeleton key={i} className="h-14 w-full rounded-lg" />
                    ))}
                  </div>
                ) : selectedUserChats.length === 0 ? (
                  <div className="text-center py-12 px-4">
                    <MessageSquare className="h-10 w-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                    <p className="text-sm text-slate-500">No chats</p>
                  </div>
                ) : (
                  <div className="p-2">
                    {selectedUserChats.map((chat) => (
                      <div
                        key={chat.id}
                        className={cn(
                          "p-3 rounded-lg cursor-pointer transition-colors mb-1",
                          selectedChat?.id === chat.id
                            ? "bg-cyan-50 dark:bg-cyan-950/50 border border-cyan-200 dark:border-cyan-800"
                            : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                        )}
                        onClick={() => {
                          setSelectedChat(chat)
                          fetchChatDetails(chat.id)
                        }}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <div className={cn(
                            "w-2 h-2 rounded-full flex-shrink-0",
                            chat.mode === "general" && "bg-cyan-500",
                            chat.mode === "productivity" && "bg-emerald-500",
                            chat.mode === "wellness" && "bg-rose-500",
                            chat.mode === "learning" && "bg-purple-500",
                            chat.mode === "creative" && "bg-amber-500",
                            chat.mode === "bff" && "bg-pink-500"
                          )} />
                          <span className="text-sm font-medium text-slate-900 dark:text-white truncate">
                            {chat.title}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span>{chat.messageCount} msgs</span>
                          <span>{new Date(chat.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>

            {/* Right panel - Messages view */}
            {selectedChat && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <Badge className={cn("text-xs")}>
                      {selectedChat.mode}
                    </Badge>
                    <span className="font-medium text-sm">{selectedChat.title}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                    onClick={() => setChatToDelete(selectedChat)}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    Delete
                  </Button>
                </div>
                <ScrollArea className="flex-1 p-4">
                  {isLoadingChat ? (
                    <div className="space-y-4">
                      {[...Array(5)].map((_, i) => (
                        <Skeleton key={i} className="h-20 w-full rounded-lg" />
                      ))}
                    </div>
                  ) : chatMessages.length === 0 ? (
                    <div className="text-center py-12">
                      <MessageSquare className="h-10 w-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                      <p className="text-sm text-slate-500">No messages</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {chatMessages.map((msg) => (
                        <div
                          key={msg.id}
                          className={cn(
                            "p-3 rounded-lg",
                            msg.role === "user"
                              ? "bg-cyan-50 dark:bg-cyan-950/30 ml-8"
                              : "bg-slate-100 dark:bg-slate-800 mr-8"
                          )}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {msg.role}
                            </Badge>
                            <span className="text-[10px] text-slate-400">
                              {new Date(msg.createdAt).toLocaleString()}
                            </span>
                            {msg.isFavorite && (
                              <Badge variant="secondary" className="text-[10px] px-1 py-0">★</Badge>
                            )}
                          </div>
                          <div className="text-sm prose prose-sm dark:prose-invert max-w-none break-words overflow-hidden">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                img: ({ src, alt }) => (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={src}
                                    alt={alt || ""}
                                    className="max-w-full h-auto rounded-lg my-2"
                                    loading="lazy"
                                  />
                                ),
                                a: ({ href, children }) => (
                                  <a
                                    href={href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-cyan-600 hover:underline"
                                  >
                                    {children}
                                  </a>
                                ),
                                code: ({ className, children }) => {
                                  const isInline = !className
                                  return isInline ? (
                                    <code className="bg-slate-200 dark:bg-slate-700 px-1 py-0.5 rounded text-xs">
                                      {children}
                                    </code>
                                  ) : (
                                    <code className={className}>{children}</code>
                                  )
                                },
                                pre: ({ children }) => (
                                  <pre className="bg-slate-900 dark:bg-slate-950 text-slate-100 p-3 rounded-lg overflow-x-auto text-xs my-2">
                                    {children}
                                  </pre>
                                ),
                              }}
                            >
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            )}
          </div>

          <DialogFooter className="flex-shrink-0 p-4 border-t gap-2">
            <Button variant="outline" onClick={() => setSelectedUser(null)}>
              Close
            </Button>
            {selectedUser?.profile?.avatar_url && (
              <Button
                variant="outline"
                className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                onClick={async () => {
                  if (!selectedUser || !user) return
                  try {
                    const response = await fetch(`/api/admin/users/${selectedUser.id}`, {
                      method: 'PATCH',
                      headers: { 
                        'Content-Type': 'application/json',
                        'x-user-id': user.$id 
                      },
                      body: JSON.stringify({ deleteAvatar: true })
                    })
                    if (response.ok) {
                      toast({
                        title: "Avatar Deleted",
                        description: "User's avatar has been removed",
                      })
                      setSelectedUser(prev => prev ? {
                        ...prev,
                        profile: prev.profile ? { ...prev.profile, avatar_url: null } : null
                      } : null)
                      fetchUsers()
                    } else {
                      throw new Error("Failed to delete avatar")
                    }
                  } catch (error) {
                    toast({
                      title: "Error",
                      description: "Failed to delete avatar",
                      variant: "destructive",
                    })
                  }
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Avatar
              </Button>
            )}
            <Button
              variant="destructive"
              onClick={() => selectedUser && setUserToDelete(selectedUser)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Confirmation */}
      <AlertDialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              Delete User
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{userToDelete?.email}</strong>?
              This will permanently delete:
              <ul className="list-disc list-inside mt-2">
                <li>{userToDelete?.stats.chatCount} chats</li>
                <li>{userToDelete?.stats.messageCount} messages</li>
                <li>All user data and settings</li>
              </ul>
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Chat Confirmation */}
      <AlertDialog open={!!chatToDelete} onOpenChange={(open) => !open && setChatToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              Delete Chat
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the chat "<strong>{chatToDelete?.title}</strong>"?
              This will permanently delete {chatToDelete?.messageCount} messages.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteChat}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete Chat
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
