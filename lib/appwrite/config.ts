// Appwrite Configuration Constants
export const APPWRITE_CONFIG = {
  endpoint: process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1',
  projectId: process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!,
  databaseId: process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!,
  
  // Collection IDs
  collections: {
    users: process.env.NEXT_PUBLIC_APPWRITE_USERS_COLLECTION_ID || 'users',
    userSettings: process.env.NEXT_PUBLIC_APPWRITE_USER_SETTINGS_COLLECTION_ID || 'user_settings',
    chatProfiles: process.env.NEXT_PUBLIC_APPWRITE_CHAT_PROFILES_COLLECTION_ID || 'chat_profiles',
    chats: process.env.NEXT_PUBLIC_APPWRITE_CHATS_COLLECTION_ID || 'chats',
    chatMessages: process.env.NEXT_PUBLIC_APPWRITE_CHAT_MESSAGES_COLLECTION_ID || 'chat_messages',
    favorites: process.env.NEXT_PUBLIC_APPWRITE_FAVORITES_COLLECTION_ID || 'favorites',
    rateLimits: process.env.NEXT_PUBLIC_APPWRITE_RATE_LIMITS_COLLECTION_ID || 'rate_limits',
    userStats: process.env.NEXT_PUBLIC_APPWRITE_USER_STATS_COLLECTION_ID || 'user_stats',
    userSessions: process.env.NEXT_PUBLIC_APPWRITE_USER_SESSIONS_COLLECTION_ID || 'user_sessions',
    reservedEmails: process.env.NEXT_PUBLIC_APPWRITE_RESERVED_EMAILS_COLLECTION_ID || 'reserved_emails',
    profiles: process.env.NEXT_PUBLIC_APPWRITE_PROFILES_COLLECTION_ID || 'profiles',
  },
  
  // Bucket IDs for storage
  buckets: {
    avatars: process.env.NEXT_PUBLIC_APPWRITE_AVATARS_BUCKET_ID || 'avatars',
  }
}

// Helper to ensure config is valid
export function validateAppwriteConfig(): boolean {
  const required = [
    APPWRITE_CONFIG.projectId,
    APPWRITE_CONFIG.databaseId,
  ]
  
  return required.every(val => val && val.length > 0)
}
