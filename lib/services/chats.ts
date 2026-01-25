import { getDatabases, Query, ID } from "../appwrite/client"
import { APPWRITE_CONFIG } from "../appwrite/config"
import type { Chat, ChatMessage } from "../../types/chat"

// Map Appwrite document to Chat type
function mapChatDocument(doc: any): Chat {
  return {
    id: doc.$id || doc.id,
    user_id: doc.user_id,
    profile_id: doc.profile_id,
    mode: doc.mode,
    title: doc.title,
    message_count: doc.message_count || 0,
    last_message_preview: doc.last_message_preview,
    created_at: doc.created_at || doc.$createdAt,
    updated_at: doc.updated_at || doc.$updatedAt,
    last_message_at: doc.last_message_at,
    is_archived: doc.is_archived || false,
    deleted_at: doc.deleted_at,
    is_public: doc.is_public || false,
    share_token: doc.share_token,
    shared_at: doc.shared_at,
  }
}

// Map Appwrite document to ChatMessage type
function mapMessageDocument(doc: any): ChatMessage {
  return {
    id: doc.$id || doc.id,
    chat_id: doc.chat_id,
    role: doc.role,
    content: doc.content,
    metadata: doc.metadata ? (typeof doc.metadata === 'string' ? JSON.parse(doc.metadata) : doc.metadata) : null,
    created_at: doc.created_at || doc.$createdAt,
    is_favorite: doc.is_favorite || false,
  }
}

export async function getChats(userId: string, options?: {
  mode?: string
  profileId?: string
  includeArchived?: boolean
  limit?: number
}): Promise<Chat[]> {
  // Use API route to avoid permission issues
  try {
    const params = new URLSearchParams()
    if (options?.mode) params.set('mode', options.mode)
    if (options?.profileId) params.set('profileId', options.profileId)
    if (options?.includeArchived) params.set('includeArchived', 'true')
    if (options?.limit) params.set('limit', String(options.limit))
    
    const response = await fetch(`/api/chats?${params.toString()}`, {
      credentials: 'include',
      headers: {
        'x-user-id': userId
      }
    })
    
    if (!response.ok) {
      throw new Error('Failed to fetch chats from API')
    }
    
    const data = await response.json()
    return (data.chats || []).map(mapChatDocument)
  } catch (error) {
    console.warn('API fetch failed, trying direct access:', error)
    // Fallback to direct database access
    return getChatsDirectly(userId, options)
  }
}

async function getChatsDirectly(userId: string, options?: {
  mode?: string
  profileId?: string
  includeArchived?: boolean
  limit?: number
}): Promise<Chat[]> {
  const databases = getDatabases()
  const queries = [
    Query.equal("user_id", userId),
    Query.orderDesc("last_message_at"),
  ]

  if (options?.mode) {
    queries.push(Query.equal("mode", options.mode))
  }

  if (options?.profileId) {
    queries.push(Query.equal("profile_id", options.profileId))
  }

  if (!options?.includeArchived) {
    queries.push(Query.equal("is_archived", false))
  }

  if (options?.limit) {
    queries.push(Query.limit(options.limit))
  }

  const response = await databases.listDocuments(
    APPWRITE_CONFIG.databaseId,
    APPWRITE_CONFIG.collections.chats,
    queries
  )

  return response.documents.map(mapChatDocument)
}

export async function getRecentChats(userId: string, limit = 10): Promise<Chat[]> {
  return getChats(userId, { limit, includeArchived: false })
}

export async function getChat(chatId: string): Promise<Chat | null> {
  const databases = getDatabases()
  try {
    const doc = await databases.getDocument(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.chats,
      chatId
    )
    return mapChatDocument(doc)
  } catch (error: any) {
    if (error?.code === 404) return null
    throw error
  }
}

export async function createChat(
  userId: string,
  mode: string,
  title: string,
  profileId?: string
): Promise<Chat> {
  const databases = getDatabases()
  const doc = await databases.createDocument(
    APPWRITE_CONFIG.databaseId,
    APPWRITE_CONFIG.collections.chats,
    ID.unique(),
    {
      user_id: userId,
      mode,
      title,
      profile_id: profileId || null,
      last_message_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_archived: false,
      message_count: 0,
    }
  )

  // Increment the persisted counter (best-effort)
  try {
    await incrementUserStats(userId, mode, 1, 0)
  } catch (e) {
    console.warn("Failed to increment user_stats after creating chat:", e)
  }

  return mapChatDocument(doc)
}

export async function updateChat(
  chatId: string,
  updates: Partial<Pick<Chat, "title" | "is_archived" | "profile_id">>
): Promise<Chat> {
  const databases = getDatabases()
  
  const updateData: Record<string, any> = {
    updated_at: new Date().toISOString(),
  }
  
  if (updates.title !== undefined) updateData.title = updates.title
  if (updates.is_archived !== undefined) updateData.is_archived = updates.is_archived
  if (updates.profile_id !== undefined) updateData.profile_id = updates.profile_id

  const doc = await databases.updateDocument(
    APPWRITE_CONFIG.databaseId,
    APPWRITE_CONFIG.collections.chats,
    chatId,
    updateData
  )
  return mapChatDocument(doc)
}

export async function archiveChat(chatId: string): Promise<Chat> {
  return updateChat(chatId, { is_archived: true })
}

export async function unarchiveChat(chatId: string): Promise<Chat> {
  return updateChat(chatId, { is_archived: false })
}

export async function deleteChat(chatId: string): Promise<void> {
  const databases = getDatabases()
  await databases.deleteDocument(
    APPWRITE_CONFIG.databaseId,
    APPWRITE_CONFIG.collections.chats,
    chatId
  )
}

// Chat Messages

export async function getChatMessages(chatId: string): Promise<ChatMessage[]> {
  const databases = getDatabases()
  const response = await databases.listDocuments(
    APPWRITE_CONFIG.databaseId,
    APPWRITE_CONFIG.collections.chatMessages,
    [
      Query.equal("chat_id", chatId),
      Query.orderAsc("created_at"),
      Query.limit(1000),
    ]
  )
  return response.documents.map(mapMessageDocument)
}

export async function addMessage(
  chatId: string,
  role: "user" | "assistant" | "system",
  content: string,
  metadata?: Record<string, unknown>
): Promise<ChatMessage> {
  const databases = getDatabases()
  
  // Add the message
  const doc = await databases.createDocument(
    APPWRITE_CONFIG.databaseId,
    APPWRITE_CONFIG.collections.chatMessages,
    ID.unique(),
    {
      chat_id: chatId,
      role,
      content,
      metadata: metadata ? JSON.stringify(metadata) : null,
      created_at: new Date().toISOString(),
      is_favorite: false,
    }
  )

  // Update the chat's last_message_at
  try {
    await databases.updateDocument(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.chats,
      chatId,
      { last_message_at: new Date().toISOString() }
    )
  } catch (e) {
    console.warn("Failed to update chat last_message_at:", e)
  }
  
  // Increment the persisted message counter (best-effort)
  try {
    const chat = await getChat(chatId)
    if (chat?.user_id) {
      await incrementUserStats(chat.user_id, null, 0, 1)
    }
  } catch (e) {
    console.warn("Failed to increment user_stats after adding message:", e)
  }

  return mapMessageDocument(doc)
}

export async function toggleMessageFavorite(messageId: string, isFavorite: boolean): Promise<void> {
  const databases = getDatabases()
  await databases.updateDocument(
    APPWRITE_CONFIG.databaseId,
    APPWRITE_CONFIG.collections.chatMessages,
    messageId,
    { is_favorite: isFavorite }
  )
}

export async function getFavoriteMessages(userId: string): Promise<ChatMessage[]> {
  const databases = getDatabases()
  
  // First get all chats for this user
  const chatsResponse = await databases.listDocuments(
    APPWRITE_CONFIG.databaseId,
    APPWRITE_CONFIG.collections.chats,
    [Query.equal("user_id", userId)]
  )
  
  const chatIds = chatsResponse.documents.map(c => c.$id)
  if (chatIds.length === 0) return []
  
  // Then get favorite messages from those chats
  const messagesResponse = await databases.listDocuments(
    APPWRITE_CONFIG.databaseId,
    APPWRITE_CONFIG.collections.chatMessages,
    [
      Query.equal("is_favorite", true),
      Query.orderDesc("created_at"),
      Query.limit(100),
    ]
  )
  
  // Filter to only include messages from user's chats
  const userMessages = messagesResponse.documents.filter(m => chatIds.includes(m.chat_id))
  return userMessages.map(mapMessageDocument)
}

// Generate title from first message
export function generateChatTitle(firstMessage: string): string {
  const maxLength = 50
  const cleaned = firstMessage.trim().replace(/\n/g, " ")
  if (cleaned.length <= maxLength) return cleaned
  return cleaned.substring(0, maxLength - 3) + "..."
}

// Stats helpers
async function incrementUserStats(
  userId: string,
  mode: string | null,
  chatsInc: number,
  messagesInc: number
): Promise<void> {
  const databases = getDatabases()
  
  try {
    // Find existing stats
    const response = await databases.listDocuments(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.userStats,
      [Query.equal("user_id", userId), Query.limit(1)]
    )
    
    if (response.documents.length > 0) {
      const stats = response.documents[0]
      const chatsByMode = stats.chats_by_mode || {}
      
      if (mode && chatsInc > 0) {
        chatsByMode[mode] = (chatsByMode[mode] || 0) + chatsInc
      }
      
      await databases.updateDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.userStats,
        stats.$id,
        {
          total_chats: (stats.total_chats || 0) + chatsInc,
          total_messages: (stats.total_messages || 0) + messagesInc,
          chats_by_mode: chatsByMode,
        }
      )
    } else {
      // Create new stats
      const chatsByMode: Record<string, number> = {}
      if (mode && chatsInc > 0) {
        chatsByMode[mode] = chatsInc
      }
      
      await databases.createDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.userStats,
        ID.unique(),
        {
          user_id: userId,
          total_chats: chatsInc,
          total_messages: messagesInc,
          chats_by_mode: chatsByMode,
        }
      )
    }
  } catch (e) {
    console.warn("Failed to update user stats:", e)
  }
}

export async function getChatStats(userId: string): Promise<{
  totalChats: number
  totalMessages: number
  chatsByMode: Record<string, number>
}> {
  // Use API route to avoid permission issues
  try {
    const response = await fetch('/api/chats/stats', {
      credentials: 'include',
      headers: {
        'x-user-id': userId
      }
    })
    
    if (!response.ok) {
      throw new Error('Failed to fetch chat stats from API')
    }
    
    const data = await response.json()
    return data.stats || { totalChats: 0, totalMessages: 0, chatsByMode: {} }
  } catch (error) {
    console.warn('API fetch failed, trying direct access:', error)
    // Fallback to direct database access
    return getChatStatsDirectly(userId)
  }
}

async function getChatStatsDirectly(userId: string): Promise<{
  totalChats: number
  totalMessages: number
  chatsByMode: Record<string, number>
}> {
  const databases = getDatabases()
  
  // Prefer the persisted counters in user_stats
  try {
    const response = await databases.listDocuments(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.userStats,
      [Query.equal("user_id", userId), Query.limit(1)]
    )

    if (response.documents.length > 0) {
      const stats = response.documents[0]
      // Handle chats_by_mode - it might be a JSON string or an object
      let chatsByMode = stats.chats_by_mode || {}
      if (typeof chatsByMode === 'string') {
        try {
          chatsByMode = JSON.parse(chatsByMode)
        } catch {
          chatsByMode = {}
        }
      }
      return {
        totalChats: Number(stats.total_chats || 0),
        totalMessages: Number(stats.total_messages || 0),
        chatsByMode: chatsByMode as Record<string, number>,
      }
    }
  } catch (e) {
    console.warn("Could not read persisted user_stats, falling back to live counts:", e)
  }

  // Fallback: compute from live data
  const chatsResponse = await databases.listDocuments(
    APPWRITE_CONFIG.databaseId,
    APPWRITE_CONFIG.collections.chats,
    [Query.equal("user_id", userId)]
  )

  const chats = chatsResponse.documents
  const chatIds = chats.map(c => c.$id)
  
  let totalMessages = 0
  if (chatIds.length > 0) {
    // Count messages for each chat
    for (const chatId of chatIds) {
      try {
        const messagesResponse = await databases.listDocuments(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.chatMessages,
          [Query.equal("chat_id", chatId), Query.limit(1)]
        )
        totalMessages += messagesResponse.total
      } catch (e) {
        // Continue even if one fails
      }
    }
  }

  const chatsByMode: Record<string, number> = {}
  chats.forEach((chat) => {
    chatsByMode[chat.mode] = (chatsByMode[chat.mode] || 0) + 1
  })

  return {
    totalChats: chats.length,
    totalMessages,
    chatsByMode,
  }
}
