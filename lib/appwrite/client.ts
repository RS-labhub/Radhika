"use client"

import { Client, Account, Databases, Storage, ID, Query } from 'appwrite'
import { APPWRITE_CONFIG } from './config'

// Create a singleton client for browser usage
let browserClient: Client | null = null
let account: Account | null = null
let databases: Databases | null = null
let storage: Storage | null = null

export function getAppwriteClient(): Client {
  if (!browserClient) {
    browserClient = new Client()
      .setEndpoint(APPWRITE_CONFIG.endpoint)
      .setProject(APPWRITE_CONFIG.projectId)
  }
  return browserClient
}

export function getAccount(): Account {
  if (!account) {
    account = new Account(getAppwriteClient())
  }
  return account
}

export function getDatabases(): Databases {
  if (!databases) {
    databases = new Databases(getAppwriteClient())
  }
  return databases
}

export function getStorage(): Storage {
  if (!storage) {
    storage = new Storage(getAppwriteClient())
  }
  return storage
}

// Export commonly used utilities
export { ID, Query }

// Reset clients (useful for sign out)
export function resetAppwriteClients(): void {
  browserClient = null
  account = null
  databases = null
  storage = null
}

// Helper function to create client for browser usage
export function createClient() {
  return {
    client: getAppwriteClient(),
    account: getAccount(),
    databases: getDatabases(),
    storage: getStorage(),
  }
}
