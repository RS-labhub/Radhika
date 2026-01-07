import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'

/**
 * Debug endpoint to check creator status and reserved emails
 * Call this to see what's happening with your creator setup
 */
export async function GET() {
  try {
    const supabase = (await createServerSupabaseClient()) as any
    const serviceRole = createServiceRoleClient() // For querying reserved_emails (bypasses RLS)

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), { 
        status: 401, 
        headers: { 'Content-Type': 'application/json' } 
      })
    }

    const userEmail = user.email?.toLowerCase()

    // Check reserved_emails table using service role (bypasses RLS)
    const { data: allReservedEmails, error: reservedListError } = await serviceRole
      .from('reserved_emails')
      .select('*')

    const { data: reservedEmail, error: reservedError } = await serviceRole
      .from('reserved_emails')
      .select('email')
      .ilike('email', userEmail || '')
      .single()

    // Check profiles table
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    const debugInfo = {
      currentUser: {
        id: user.id,
        email: user.email,
        emailLower: userEmail,
      },
      reservedEmails: {
        all: allReservedEmails || [],
        error: reservedListError?.message || null,
        totalCount: allReservedEmails?.length || 0,
      },
      reservedEmailCheck: {
        found: !!reservedEmail,
        data: reservedEmail || null,
        error: reservedError?.message || null,
        errorCode: reservedError?.code || null,
      },
      profile: {
        exists: !!profile,
        data: profile || null,
        error: profileError?.message || null,
        errorCode: profileError?.code || null,
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
