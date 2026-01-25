import { Client, Account, Databases, Storage, Users, ID, Query, Permission, Role } from 'node-appwrite'
import { cookies } from 'next/headers'
import { APPWRITE_CONFIG } from './config'

// Server-side Appwrite client with session handling
export async function createServerAppwriteClient() {
  const client = new Client()
    .setEndpoint(APPWRITE_CONFIG.endpoint)
    .setProject(APPWRITE_CONFIG.projectId)

  // Get the session from cookies
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('appwrite-session')
  const userIdCookie = cookieStore.get('appwrite-user-id')
  
  // Debug logging
  console.log('[ServerAppwrite] Session cookie present:', !!sessionCookie?.value)
  console.log('[ServerAppwrite] User ID cookie present:', !!userIdCookie?.value)
  
  if (sessionCookie?.value) {
    try {
      client.setSession(sessionCookie.value)
    } catch (e) {
      console.warn('Failed to set session from cookie:', e)
    }
  }

  return {
    client,
    account: new Account(client),
    databases: new Databases(client),
    storage: new Storage(client),
    userId: userIdCookie?.value, // Provide user ID as fallback
  }
}

// Server client with API key for admin operations (bypasses permissions)
export function createServiceClient() {
  const client = new Client()
    .setEndpoint(APPWRITE_CONFIG.endpoint)
    .setProject(APPWRITE_CONFIG.projectId)
    .setKey(process.env.APPWRITE_API_KEY!)

  return {
    client,
    account: new Account(client),
    databases: new Databases(client),
    storage: new Storage(client),
    users: new Users(client),
  }
}

export { ID, Query, Permission, Role }
