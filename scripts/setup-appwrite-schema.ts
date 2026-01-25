/**
 * Appwrite Database Schema Setup Script
 * 
 * This script creates all necessary collections and attributes in Appwrite.
 * 
 * Run with: npx ts-node scripts/setup-appwrite-schema.ts
 * 
 * Prerequisites:
 * - Set NEXT_PUBLIC_APPWRITE_ENDPOINT
 * - Set NEXT_PUBLIC_APPWRITE_PROJECT_ID
 * - Set NEXT_PUBLIC_APPWRITE_DATABASE_ID  
 * - Set APPWRITE_API_KEY (with appropriate permissions)
 */

import { Client, Databases, ID, Permission, Role } from 'node-appwrite'
import { config as loadEnv } from 'dotenv'

// Load environment variables from .env file
loadEnv()

const config = {
  endpoint: process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1',
  projectId: process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!,
  databaseId: process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!,
  apiKey: process.env.APPWRITE_API_KEY!,
}

const COLLECTIONS = {
  users: 'users',
  userSettings: 'user_settings',
  chatProfiles: 'chat_profiles',
  chats: 'chats',
  chatMessages: 'chat_messages',
  favorites: 'favorites',
  rateLimits: 'rate_limits',
  userStats: 'user_stats',
  userSessions: 'user_sessions',
  reservedEmails: 'reserved_emails',
  profiles: 'profiles',
}

async function setupSchema() {
  if (!config.projectId || !config.databaseId || !config.apiKey) {
    console.error('Missing required environment variables!')
    console.error('Required: NEXT_PUBLIC_APPWRITE_PROJECT_ID, NEXT_PUBLIC_APPWRITE_DATABASE_ID, APPWRITE_API_KEY')
    process.exit(1)
  }

  const client = new Client()
    .setEndpoint(config.endpoint)
    .setProject(config.projectId)
    .setKey(config.apiKey)

  const databases = new Databases(client)

  console.log('🚀 Setting up Appwrite database schema...\n')

  // Create database if it doesn't exist
  try {
    await databases.get(config.databaseId)
    console.log(`✅ Database '${config.databaseId}' exists`)
  } catch (e: any) {
    if (e.code === 404) {
      console.log(`📦 Creating database '${config.databaseId}'...`)
      await databases.create(config.databaseId, 'Radhika Chat Database')
      console.log(`✅ Database created`)
    } else {
      throw e
    }
  }

  // Helper to create collection if not exists
  async function createCollectionIfNotExists(
    collectionId: string,
    name: string,
    permissions: string[] = []
  ) {
    try {
      await databases.getCollection(config.databaseId, collectionId)
      console.log(`✅ Collection '${name}' exists`)
      return false // Not created
    } catch (e: any) {
      if (e.code === 404) {
        console.log(`📦 Creating collection '${name}'...`)
        await databases.createCollection(
          config.databaseId,
          collectionId,
          name,
          permissions.length > 0 ? permissions : undefined
        )
        console.log(`✅ Collection '${name}' created`)
        return true // Created
      }
      throw e
    }
  }

  // Helper to create attribute with error handling
  async function createAttribute(
    collectionId: string,
    type: string,
    key: string,
    options: any = {}
  ) {
    try {
      switch (type) {
        case 'string':
          await databases.createStringAttribute(
            config.databaseId,
            collectionId,
            key,
            options.size || 255,
            options.required ?? false,
            options.default,
            options.array ?? false
          )
          break
        case 'email':
          await databases.createEmailAttribute(
            config.databaseId,
            collectionId,
            key,
            options.required ?? false,
            options.default,
            options.array ?? false
          )
          break
        case 'boolean':
          await databases.createBooleanAttribute(
            config.databaseId,
            collectionId,
            key,
            options.required ?? false,
            options.default
          )
          break
        case 'integer':
          await databases.createIntegerAttribute(
            config.databaseId,
            collectionId,
            key,
            options.required ?? false,
            options.min,
            options.max,
            options.default
          )
          break
        case 'datetime':
          await databases.createDatetimeAttribute(
            config.databaseId,
            collectionId,
            key,
            options.required ?? false,
            options.default
          )
          break
        case 'enum':
          await databases.createEnumAttribute(
            config.databaseId,
            collectionId,
            key,
            options.elements,
            options.required ?? false,
            options.default
          )
          break
      }
      console.log(`  ✓ Attribute '${key}' created`)
    } catch (e: any) {
      if (e.code === 409) {
        console.log(`  ⚡ Attribute '${key}' already exists`)
      } else {
        console.error(`  ✗ Failed to create attribute '${key}':`, e.message)
      }
    }
  }

  // Helper to create index
  async function createIndex(
    collectionId: string,
    key: string,
    type: string,
    attributes: string[],
    orders?: string[]
  ) {
    try {
      await databases.createIndex(
        config.databaseId,
        collectionId,
        key,
        type as any,
        attributes,
        orders as any
      )
      console.log(`  ✓ Index '${key}' created`)
    } catch (e: any) {
      if (e.code === 409) {
        console.log(`  ⚡ Index '${key}' already exists`)
      } else {
        console.error(`  ✗ Failed to create index '${key}':`, e.message)
      }
    }
  }

  // Wait for attributes to be available
  async function waitForAttributes(collectionId: string, attributes: string[]) {
    console.log(`  ⏳ Waiting for attributes to be ready...`)
    await new Promise(resolve => setTimeout(resolve, 2000))
  }

  // ============================================
  // USERS COLLECTION
  // ============================================
  console.log('\n📋 Setting up Users collection...')
  // Note: Document-level permissions are set when creating each document,
  // not at collection level. Collection permissions allow any authenticated user access,
  // and individual documents will have their own permissions.
  await createCollectionIfNotExists(
    COLLECTIONS.users,
    'Users',
    [
      Permission.read(Role.users()),
      Permission.create(Role.users()),
      Permission.update(Role.users()),
    ]
  )
  
  await createAttribute(COLLECTIONS.users, 'email', 'email', { required: true })
  await createAttribute(COLLECTIONS.users, 'enum', 'role', {
    elements: ['guest', 'authenticated', 'premium', 'admin'],
    default: 'authenticated',
  })
  await createAttribute(COLLECTIONS.users, 'string', 'display_name', { size: 255 })
  await createAttribute(COLLECTIONS.users, 'string', 'pet_name', { size: 255 })
  await createAttribute(COLLECTIONS.users, 'string', 'avatar_url', { size: 2048 })
  await createAttribute(COLLECTIONS.users, 'datetime', 'created_at')
  await createAttribute(COLLECTIONS.users, 'datetime', 'updated_at')
  await createAttribute(COLLECTIONS.users, 'datetime', 'last_login_at')

  await waitForAttributes(COLLECTIONS.users, ['email'])
  await createIndex(COLLECTIONS.users, 'email_idx', 'unique', ['email'])

  // ============================================
  // USER SETTINGS COLLECTION
  // ============================================
  console.log('\n📋 Setting up User Settings collection...')
  await createCollectionIfNotExists(COLLECTIONS.userSettings, 'User Settings')
  
  await createAttribute(COLLECTIONS.userSettings, 'string', 'user_id', { required: true, size: 36 })
  await createAttribute(COLLECTIONS.userSettings, 'string', 'theme', { default: 'system', size: 50 })
  await createAttribute(COLLECTIONS.userSettings, 'string', 'language', { default: 'en', size: 10 })
  await createAttribute(COLLECTIONS.userSettings, 'boolean', 'voice_enabled', { default: false })
  await createAttribute(COLLECTIONS.userSettings, 'string', 'voice_settings', { size: 10000 }) // JSON string
  await createAttribute(COLLECTIONS.userSettings, 'string', 'selected_chat_mode', { default: 'general', size: 50 })
  await createAttribute(COLLECTIONS.userSettings, 'string', 'ui_style', { default: 'modern', size: 50 })
  await createAttribute(COLLECTIONS.userSettings, 'string', 'personalization', { size: 10000 }) // JSON string
  await createAttribute(COLLECTIONS.userSettings, 'string', 'gender', { default: 'other', size: 20 })
  await createAttribute(COLLECTIONS.userSettings, 'string', 'age', { default: 'adult', size: 20 })
  await createAttribute(COLLECTIONS.userSettings, 'integer', 'cached_total_chats', { default: 0 })
  await createAttribute(COLLECTIONS.userSettings, 'integer', 'cached_total_messages', { default: 0 })
  await createAttribute(COLLECTIONS.userSettings, 'datetime', 'stats_updated_at')
  await createAttribute(COLLECTIONS.userSettings, 'datetime', 'created_at')
  await createAttribute(COLLECTIONS.userSettings, 'datetime', 'updated_at')

  await waitForAttributes(COLLECTIONS.userSettings, ['user_id'])
  await createIndex(COLLECTIONS.userSettings, 'user_id_idx', 'unique', ['user_id'])

  // ============================================
  // CHAT PROFILES COLLECTION
  // ============================================
  console.log('\n📋 Setting up Chat Profiles collection...')
  await createCollectionIfNotExists(COLLECTIONS.chatProfiles, 'Chat Profiles')
  
  await createAttribute(COLLECTIONS.chatProfiles, 'string', 'user_id', { required: true, size: 36 })
  await createAttribute(COLLECTIONS.chatProfiles, 'string', 'mode', { required: true, size: 50 })
  await createAttribute(COLLECTIONS.chatProfiles, 'string', 'name', { required: true, size: 255 })
  await createAttribute(COLLECTIONS.chatProfiles, 'string', 'settings', { size: 10000 }) // JSON string
  await createAttribute(COLLECTIONS.chatProfiles, 'string', 'metadata', { size: 10000 }) // JSON string
  await createAttribute(COLLECTIONS.chatProfiles, 'datetime', 'created_at')
  await createAttribute(COLLECTIONS.chatProfiles, 'datetime', 'updated_at')

  await waitForAttributes(COLLECTIONS.chatProfiles, ['user_id', 'mode'])
  await createIndex(COLLECTIONS.chatProfiles, 'user_id_idx', 'key', ['user_id'])
  await createIndex(COLLECTIONS.chatProfiles, 'user_mode_idx', 'key', ['user_id', 'mode'])

  // ============================================
  // CHATS COLLECTION
  // ============================================
  console.log('\n📋 Setting up Chats collection...')
  await createCollectionIfNotExists(COLLECTIONS.chats, 'Chats')
  
  await createAttribute(COLLECTIONS.chats, 'string', 'user_id', { required: true, size: 36 })
  await createAttribute(COLLECTIONS.chats, 'string', 'profile_id', { size: 36 })
  await createAttribute(COLLECTIONS.chats, 'string', 'mode', { required: true, size: 50 })
  await createAttribute(COLLECTIONS.chats, 'string', 'title', { required: true, size: 500 })
  await createAttribute(COLLECTIONS.chats, 'integer', 'message_count', { default: 0 })
  await createAttribute(COLLECTIONS.chats, 'string', 'last_message_preview', { size: 200 })
  await createAttribute(COLLECTIONS.chats, 'datetime', 'created_at')
  await createAttribute(COLLECTIONS.chats, 'datetime', 'updated_at')
  await createAttribute(COLLECTIONS.chats, 'datetime', 'last_message_at')
  await createAttribute(COLLECTIONS.chats, 'boolean', 'is_archived', { default: false })
  await createAttribute(COLLECTIONS.chats, 'datetime', 'deleted_at')
  await createAttribute(COLLECTIONS.chats, 'boolean', 'is_public', { default: false })
  await createAttribute(COLLECTIONS.chats, 'string', 'share_token', { size: 100 })
  await createAttribute(COLLECTIONS.chats, 'datetime', 'shared_at')

  await waitForAttributes(COLLECTIONS.chats, ['user_id', 'mode', 'share_token'])
  await createIndex(COLLECTIONS.chats, 'user_id_idx', 'key', ['user_id'])
  await createIndex(COLLECTIONS.chats, 'user_mode_idx', 'key', ['user_id', 'mode'])
  await createIndex(COLLECTIONS.chats, 'share_token_idx', 'unique', ['share_token'])
  await createIndex(COLLECTIONS.chats, 'user_last_message_idx', 'key', ['user_id', 'last_message_at'], ['ASC', 'DESC'])

  // ============================================
  // CHAT MESSAGES COLLECTION
  // ============================================
  console.log('\n📋 Setting up Chat Messages collection...')
  await createCollectionIfNotExists(COLLECTIONS.chatMessages, 'Chat Messages')
  
  await createAttribute(COLLECTIONS.chatMessages, 'string', 'chat_id', { required: true, size: 36 })
  await createAttribute(COLLECTIONS.chatMessages, 'enum', 'role', {
    elements: ['user', 'assistant', 'system'],
    required: true,
  })
  await createAttribute(COLLECTIONS.chatMessages, 'string', 'content', { required: true, size: 100000 })
  await createAttribute(COLLECTIONS.chatMessages, 'string', 'metadata', { size: 10000 }) // JSON string
  await createAttribute(COLLECTIONS.chatMessages, 'datetime', 'created_at')
  await createAttribute(COLLECTIONS.chatMessages, 'boolean', 'is_favorite', { default: false })
  await createAttribute(COLLECTIONS.chatMessages, 'integer', 'seq_num')

  await waitForAttributes(COLLECTIONS.chatMessages, ['chat_id', 'created_at'])
  await createIndex(COLLECTIONS.chatMessages, 'chat_id_idx', 'key', ['chat_id'])
  await createIndex(COLLECTIONS.chatMessages, 'chat_created_idx', 'key', ['chat_id', 'created_at'], ['ASC', 'ASC'])
  await createIndex(COLLECTIONS.chatMessages, 'chat_seq_idx', 'key', ['chat_id', 'seq_num'], ['ASC', 'DESC'])

  // ============================================
  // FAVORITES COLLECTION
  // ============================================
  console.log('\n📋 Setting up Favorites collection...')
  await createCollectionIfNotExists(COLLECTIONS.favorites, 'Favorites')
  
  await createAttribute(COLLECTIONS.favorites, 'string', 'user_id', { required: true, size: 36 })
  await createAttribute(COLLECTIONS.favorites, 'string', 'message_id', { required: true, size: 36 })
  await createAttribute(COLLECTIONS.favorites, 'string', 'chat_id', { size: 36 })
  await createAttribute(COLLECTIONS.favorites, 'datetime', 'created_at')

  await waitForAttributes(COLLECTIONS.favorites, ['user_id', 'message_id'])
  await createIndex(COLLECTIONS.favorites, 'user_id_idx', 'key', ['user_id'])
  await createIndex(COLLECTIONS.favorites, 'user_message_idx', 'unique', ['user_id', 'message_id'])

  // ============================================
  // RATE LIMITS COLLECTION
  // ============================================
  console.log('\n📋 Setting up Rate Limits collection...')
  await createCollectionIfNotExists(COLLECTIONS.rateLimits, 'Rate Limits')
  
  await createAttribute(COLLECTIONS.rateLimits, 'string', 'identifier', { required: true, size: 255 })
  await createAttribute(COLLECTIONS.rateLimits, 'integer', 'request_count', { default: 0 })
  await createAttribute(COLLECTIONS.rateLimits, 'datetime', 'window_start')
  await createAttribute(COLLECTIONS.rateLimits, 'datetime', 'created_at')

  await waitForAttributes(COLLECTIONS.rateLimits, ['identifier'])
  await createIndex(COLLECTIONS.rateLimits, 'identifier_idx', 'unique', ['identifier'])

  // ============================================
  // USER STATS COLLECTION
  // ============================================
  console.log('\n📋 Setting up User Stats collection...')
  await createCollectionIfNotExists(COLLECTIONS.userStats, 'User Stats')
  
  await createAttribute(COLLECTIONS.userStats, 'string', 'user_id', { required: true, size: 36 })
  await createAttribute(COLLECTIONS.userStats, 'integer', 'total_chats', { default: 0 })
  await createAttribute(COLLECTIONS.userStats, 'integer', 'total_messages', { default: 0 })
  await createAttribute(COLLECTIONS.userStats, 'string', 'chats_by_mode', { size: 10000 }) // JSON string
  await createAttribute(COLLECTIONS.userStats, 'datetime', 'created_at')
  await createAttribute(COLLECTIONS.userStats, 'datetime', 'updated_at')

  await waitForAttributes(COLLECTIONS.userStats, ['user_id'])
  await createIndex(COLLECTIONS.userStats, 'user_id_idx', 'unique', ['user_id'])

  // ============================================
  // USER SESSIONS COLLECTION
  // ============================================
  console.log('\n📋 Setting up User Sessions collection...')
  await createCollectionIfNotExists(COLLECTIONS.userSessions, 'User Sessions')
  
  await createAttribute(COLLECTIONS.userSessions, 'string', 'user_id', { size: 36 })
  await createAttribute(COLLECTIONS.userSessions, 'string', 'session_token', { size: 500 })
  await createAttribute(COLLECTIONS.userSessions, 'datetime', 'last_activity_at')
  await createAttribute(COLLECTIONS.userSessions, 'datetime', 'created_at')
  await createAttribute(COLLECTIONS.userSessions, 'datetime', 'expires_at')
  await createAttribute(COLLECTIONS.userSessions, 'string', 'metadata', { size: 10000 }) // JSON string

  await waitForAttributes(COLLECTIONS.userSessions, ['user_id'])
  await createIndex(COLLECTIONS.userSessions, 'user_id_idx', 'key', ['user_id'])
  await createIndex(COLLECTIONS.userSessions, 'expires_at_idx', 'key', ['expires_at'])

  // ============================================
  // RESERVED EMAILS COLLECTION
  // ============================================
  console.log('\n📋 Setting up Reserved Emails collection...')
  await createCollectionIfNotExists(COLLECTIONS.reservedEmails, 'Reserved Emails')
  
  await createAttribute(COLLECTIONS.reservedEmails, 'email', 'email', { required: true })
  await createAttribute(COLLECTIONS.reservedEmails, 'string', 'note', { size: 500 })
  await createAttribute(COLLECTIONS.reservedEmails, 'datetime', 'created_at')

  await waitForAttributes(COLLECTIONS.reservedEmails, ['email'])
  await createIndex(COLLECTIONS.reservedEmails, 'email_idx', 'unique', ['email'])

  // ============================================
  // PROFILES COLLECTION (lightweight for creator detection)
  // ============================================
  console.log('\n📋 Setting up Profiles collection...')
  await createCollectionIfNotExists(COLLECTIONS.profiles, 'Profiles')
  
  await createAttribute(COLLECTIONS.profiles, 'string', 'user_id', { required: true, size: 36 })
  await createAttribute(COLLECTIONS.profiles, 'email', 'email')
  await createAttribute(COLLECTIONS.profiles, 'string', 'full_name', { size: 255 })
  await createAttribute(COLLECTIONS.profiles, 'boolean', 'is_creator', { default: false })
  await createAttribute(COLLECTIONS.profiles, 'datetime', 'updated_at')

  await waitForAttributes(COLLECTIONS.profiles, ['user_id'])
  await createIndex(COLLECTIONS.profiles, 'user_id_idx', 'unique', ['user_id'])

  console.log('\n✨ Database schema setup complete!')
  console.log('\nNext steps:')
  console.log('1. Review the collections in your Appwrite console')
  console.log('2. Configure document-level permissions as needed')
}

// Run the setup
setupSchema().catch((error) => {
  console.error('❌ Schema setup failed:', error)
  process.exit(1)
})
