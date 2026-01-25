import { getDatabases, Query, ID } from "../appwrite/client"
import { APPWRITE_CONFIG } from "../appwrite/config"
import type { ChatProfile } from "../../types/chat"

const MAX_PROFILES_PER_MODE = 3

// Map Appwrite document to ChatProfile type
function mapDocument(doc: any): ChatProfile {
  return {
    id: doc.$id || doc.id,
    user_id: doc.user_id,
    mode: doc.mode,
    name: doc.name,
    settings: doc.settings ? (typeof doc.settings === 'string' ? JSON.parse(doc.settings) : doc.settings) : null,
    metadata: doc.metadata ? (typeof doc.metadata === 'string' ? JSON.parse(doc.metadata) : doc.metadata) : null,
    created_at: doc.created_at || doc.$createdAt,
    updated_at: doc.updated_at || doc.$updatedAt,
  }
}

export async function getProfiles(userId: string): Promise<ChatProfile[]> {
  // Use API route to avoid permission issues
  try {
    const response = await fetch('/api/profiles', {
      credentials: 'include',
      headers: {
        'x-user-id': userId
      }
    })
    
    if (!response.ok) {
      throw new Error('Failed to fetch profiles from API')
    }
    
    const data = await response.json()
    return (data.profiles || []).map(mapDocument)
  } catch (error) {
    console.warn('API fetch failed, trying direct access:', error)
    // Fallback to direct database access
    return getProfilesDirectly(userId)
  }
}

async function getProfilesDirectly(userId: string): Promise<ChatProfile[]> {
  const databases = getDatabases()
  const response = await databases.listDocuments(
    APPWRITE_CONFIG.databaseId,
    APPWRITE_CONFIG.collections.chatProfiles,
    [
      Query.equal("user_id", userId),
      Query.orderAsc("created_at"),
    ]
  )
  return response.documents.map(mapDocument)
}

export async function getProfilesByMode(userId: string, mode: string): Promise<ChatProfile[]> {
  // Use API route to avoid permission issues
  try {
    const params = new URLSearchParams({ mode })
    const response = await fetch(`/api/profiles?${params.toString()}`, {
      credentials: 'include',
      headers: {
        'x-user-id': userId
      }
    })
    
    if (!response.ok) {
      throw new Error('Failed to fetch profiles from API')
    }
    
    const data = await response.json()
    return (data.profiles || []).map(mapDocument)
  } catch (error) {
    console.warn('API fetch failed, trying direct access:', error)
    // Fallback to direct database access
    return getProfilesByModeDirectly(userId, mode)
  }
}

async function getProfilesByModeDirectly(userId: string, mode: string): Promise<ChatProfile[]> {
  const databases = getDatabases()
  const response = await databases.listDocuments(
    APPWRITE_CONFIG.databaseId,
    APPWRITE_CONFIG.collections.chatProfiles,
    [
      Query.equal("user_id", userId),
      Query.equal("mode", mode),
      Query.orderAsc("created_at"),
    ]
  )
  return response.documents.map(mapDocument)
}

export async function getProfile(profileId: string): Promise<ChatProfile | null> {
  // Use API route to avoid permission issues
  try {
    const response = await fetch(`/api/profiles/${profileId}`, {
      credentials: 'include'
    })
    
    if (response.status === 404) return null
    if (!response.ok) {
      throw new Error('Failed to fetch profile from API')
    }
    
    const data = await response.json()
    return data.profile ? mapDocument(data.profile) : null
  } catch (error) {
    console.warn('API fetch failed, trying direct access:', error)
    // Fallback to direct database access
    return getProfileDirectly(profileId)
  }
}

async function getProfileDirectly(profileId: string): Promise<ChatProfile | null> {
  const databases = getDatabases()
  try {
    const doc = await databases.getDocument(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.chatProfiles,
      profileId
    )
    return mapDocument(doc)
  } catch (error: any) {
    if (error?.code === 404) return null
    throw error
  }
}

export async function createProfile(
  userId: string,
  mode: string,
  name: string,
  settings?: Record<string, unknown>
): Promise<ChatProfile> {
  // Use API route to avoid permission issues
  try {
    const response = await fetch('/api/profiles', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId
      },
      body: JSON.stringify({ mode, name, settings })
    })
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.error || 'Failed to create profile')
    }
    
    const data = await response.json()
    return mapDocument(data.profile)
  } catch (error: any) {
    // Check if it's a quota error
    if (error.message?.includes('Maximum')) {
      throw error
    }
    console.warn('API failed, trying direct access:', error)
    // Fallback to direct database access
    return createProfileDirectly(userId, mode, name, settings)
  }
}

async function createProfileDirectly(
  userId: string,
  mode: string,
  name: string,
  settings?: Record<string, unknown>
): Promise<ChatProfile> {
  const databases = getDatabases()
  
  // Check if user already has max profiles for this mode
  const existingProfiles = await getProfilesByModeDirectly(userId, mode)
  if (existingProfiles.length >= MAX_PROFILES_PER_MODE) {
    throw new Error(`Maximum of ${MAX_PROFILES_PER_MODE} profiles per mode allowed`)
  }

  const doc = await databases.createDocument(
    APPWRITE_CONFIG.databaseId,
    APPWRITE_CONFIG.collections.chatProfiles,
    ID.unique(),
    {
      user_id: userId,
      mode,
      name,
      settings: settings ? JSON.stringify(settings) : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  )
  return mapDocument(doc)
}

export async function updateProfile(
  profileId: string,
  updates: Partial<Pick<ChatProfile, "name" | "settings" | "metadata">>
): Promise<ChatProfile> {
  // Use API route to avoid permission issues
  try {
    const response = await fetch(`/api/profiles/${profileId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updates)
    })
    
    if (!response.ok) {
      throw new Error('Failed to update profile via API')
    }
    
    const data = await response.json()
    return mapDocument(data.profile)
  } catch (error) {
    console.warn('API failed, trying direct access:', error)
    // Fallback to direct database access
    return updateProfileDirectly(profileId, updates)
  }
}

async function updateProfileDirectly(
  profileId: string,
  updates: Partial<Pick<ChatProfile, "name" | "settings" | "metadata">>
): Promise<ChatProfile> {
  const databases = getDatabases()
  
  const updateData: Record<string, any> = {
    updated_at: new Date().toISOString(),
  }
  
  if (updates.name !== undefined) updateData.name = updates.name
  if (updates.settings !== undefined) updateData.settings = JSON.stringify(updates.settings)
  if (updates.metadata !== undefined) updateData.metadata = JSON.stringify(updates.metadata)

  const doc = await databases.updateDocument(
    APPWRITE_CONFIG.databaseId,
    APPWRITE_CONFIG.collections.chatProfiles,
    profileId,
    updateData
  )
  return mapDocument(doc)
}

export async function renameProfile(profileId: string, newName: string): Promise<ChatProfile> {
  return updateProfile(profileId, { name: newName })
}

export async function deleteProfile(profileId: string): Promise<void> {
  // Use API route to avoid permission issues
  try {
    const response = await fetch(`/api/profiles/${profileId}`, {
      method: 'DELETE',
      credentials: 'include'
    })
    
    if (!response.ok && response.status !== 404) {
      throw new Error('Failed to delete profile via API')
    }
  } catch (error) {
    console.warn('API failed, trying direct access:', error)
    // Fallback to direct database access
    await deleteProfileDirectly(profileId)
  }
}

async function deleteProfileDirectly(profileId: string): Promise<void> {
  const databases = getDatabases()
  await databases.deleteDocument(
    APPWRITE_CONFIG.databaseId,
    APPWRITE_CONFIG.collections.chatProfiles,
    profileId
  )
}

export async function getProfileCount(userId: string, mode: string): Promise<number> {
  const profiles = await getProfilesByMode(userId, mode)
  return profiles.length
}

export function canCreateProfile(currentCount: number): boolean {
  return currentCount < MAX_PROFILES_PER_MODE
}
