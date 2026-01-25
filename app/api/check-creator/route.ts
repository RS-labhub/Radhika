import { NextRequest } from 'next/server'
import { createServerAppwriteClient, createServiceClient, Query } from '@/lib/appwrite/server'
import { APPWRITE_CONFIG } from '@/lib/appwrite/config'
import { CORE_SYSTEM_PROMPT, CREATOR_BOYFRIEND_PROMPT } from '@/lib/chat/system-prompts'

// Helper to get user from session or header/cookies
async function getUser(request: NextRequest, account: any, serviceClient: any, userId?: string) {
  try {
    return await account.get()
  } catch (error: any) {
    // Try to get user ID from header or function parameter as fallback
    const userIdValue = userId || request.headers.get('x-user-id')
    if (userIdValue) {
      try {
        return await serviceClient.users.get(userIdValue)
      } catch {
        return null
      }
    }
    return null
  }
}

export async function GET(request: NextRequest) {
  try {
    const { account, userId } = await createServerAppwriteClient()
    const serviceClient = createServiceClient()

    const user = await getUser(request, account, serviceClient, userId)
    if (!user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
    }

    // Check if the user's email is in the reserved_emails collection
    const userEmail = user.email?.toLowerCase()
    
    console.log('[check-creator] Checking creator status for:', userEmail)
    
    // Use service client to bypass permissions on reserved_emails collection
    let reservedEmail = null
    try {
      const reservedEmails = await serviceClient.databases.listDocuments(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.reservedEmails,
        [Query.equal('email', userEmail || '')]
      )
      if (reservedEmails.documents.length > 0) {
        reservedEmail = reservedEmails.documents[0]
      }
    } catch (e) {
      console.log('[check-creator] Reserved emails check error:', e)
    }

    console.log('[check-creator] Reserved email check:', { reservedEmail })

    // Also get the profile for fallback (use service client for consistent permissions)
    let profile = null
    try {
      const profiles = await serviceClient.databases.listDocuments(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.profiles,
        [Query.equal('user_id', user.$id)]
      )
      if (profiles.documents.length > 0) {
        profile = profiles.documents[0]
      }
    } catch (e) {
      console.log('[check-creator] Profile check error:', e)
    }

    console.log('[check-creator] Profile check:', { profile })

    // If no profile exists, create one now
    if (!profile) {
      console.log('[check-creator] No profile found, creating one...')
      
      const isCreatorFromEmail = !!reservedEmail
      
      try {
        profile = await serviceClient.databases.createDocument(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.profiles,
          user.$id,
          {
            user_id: user.$id,
            email: user.email,
            is_creator: isCreatorFromEmail,
            updated_at: new Date().toISOString()
          }
        )

        console.log('[check-creator] Profile created:', { profile })

        const isCreator = profile.is_creator === true
        const systemPrompt = isCreator ? CREATOR_BOYFRIEND_PROMPT : CORE_SYSTEM_PROMPT
        
        return new Response(JSON.stringify({ 
          isCreator, 
          systemPrompt, 
          email: profile.email,
          debug: { createdProfile: true, reservedEmail: !!reservedEmail }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      } catch (insertError) {
        console.error('[check-creator] Profile insert error:', insertError)
      }
    }

    // User is creator if they're in reserved_emails OR if profile.is_creator is true
    const isCreator = !!reservedEmail || profile?.is_creator === true

    console.log('[check-creator] Final isCreator:', isCreator, { hasReservedEmail: !!reservedEmail, profileIsCreator: profile?.is_creator })

    // Use the special boyfriend prompt for the creator/owner
    const systemPrompt = isCreator
      ? CREATOR_BOYFRIEND_PROMPT
      : CORE_SYSTEM_PROMPT

    return new Response(JSON.stringify({ 
      isCreator, 
      systemPrompt, 
      email: profile?.email ?? user.email ?? null,
      debug: { hasReservedEmail: !!reservedEmail, profileIsCreator: profile?.is_creator }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (err: any) {
    console.error('[check-creator] Error:', err)
    return new Response(JSON.stringify({ error: err?.message ?? String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
