import { NextRequest } from 'next/server'
import { createServerAppwriteClient, createServiceClient, Query } from '@/lib/appwrite/server'
import { APPWRITE_CONFIG } from '@/lib/appwrite/config'
import { getAuthenticatedUser } from '@/lib/api-utils'

/**
 * Debug endpoint to check creator status and reserved emails
 * Call this to see what's happening with your creator setup
 */
export async function GET(request: NextRequest) {
  try {
    const { account, userId } = await createServerAppwriteClient()
    const serviceClient = createServiceClient()

    const user = await getAuthenticatedUser(request, account, serviceClient, userId)
    if (!user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), { 
        status: 401, 
        headers: { 'Content-Type': 'application/json' } 
      })
    }

    const userEmail = user.email?.toLowerCase()

    // Check reserved_emails collection using service client
    let allReservedEmails: any[] = []
    let reservedListError = null
    try {
      const result = await serviceClient.databases.listDocuments(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.reservedEmails,
        [Query.limit(100)]
      )
      allReservedEmails = result.documents
    } catch (e: any) {
      reservedListError = e?.message || String(e)
    }

    let reservedEmail = null
    let reservedError = null
    try {
      const result = await serviceClient.databases.listDocuments(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.reservedEmails,
        [Query.equal('email', userEmail || '')]
      )
      if (result.documents.length > 0) {
        reservedEmail = result.documents[0]
      }
    } catch (e: any) {
      reservedError = e?.message || String(e)
    }

    // Check profiles collection (use service client for consistent access)
    let profile = null
    let profileError = null
    try {
      const result = await serviceClient.databases.listDocuments(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.profiles,
        [Query.equal('user_id', user.$id)]
      )
      if (result.documents.length > 0) {
        profile = result.documents[0]
      }
    } catch (e: any) {
      profileError = e?.message || String(e)
    }

    const debugInfo = {
      currentUser: {
        id: user.$id,
        email: user.email,
        emailLower: userEmail,
      },
      reservedEmails: {
        all: allReservedEmails || [],
        error: reservedListError,
        totalCount: allReservedEmails?.length || 0,
      },
      reservedEmailCheck: {
        found: !!reservedEmail,
        data: reservedEmail || null,
        error: reservedError,
      },
      profile: {
        exists: !!profile,
        data: profile || null,
        error: profileError,
      },
      isCreator: !!reservedEmail || profile?.is_creator === true,
      calculations: {
        hasReservedEmail: !!reservedEmail,
        profileIsCreator: profile?.is_creator === true,
      }
    }

    return new Response(JSON.stringify(debugInfo, null, 2), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    })
  } catch (err: any) {
    console.error('[debug-creator] Error:', err)
    return new Response(JSON.stringify({ 
      error: err?.message ?? String(err),
      stack: err?.stack 
    }, null, 2), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    })
  }
}
