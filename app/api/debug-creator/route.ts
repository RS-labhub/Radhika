import { createServiceRoleClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/api-utils'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { 'Content-Type': 'application/json' } })

// Debug endpoint to check creator status and reserved emails
export async function GET() {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return json({ error: 'Not authenticated' }, 401)
    }

    const supabase = createServiceRoleClient()
    const userEmail = user.email?.toLowerCase()

    const { data: allData, error: listError } = await supabase.from('reserved_emails').select('*').limit(100)
    const allReservedEmails = allData || []

    const { data: reservedData, error: reservedError } = await supabase
      .from('reserved_emails')
      .select('*')
      .ilike('email', (userEmail || '').replace(/[\\%_]/g, '\\$&'))
      .limit(1)
    const reservedEmail = reservedData?.[0] ?? null

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()

    return json({
      currentUser: {
        id: user.id,
        email: user.email,
        emailLower: userEmail,
      },
      reservedEmails: {
        all: allReservedEmails,
        error: listError?.message ?? null,
        totalCount: allReservedEmails.length,
      },
      reservedEmailCheck: {
        found: !!reservedEmail,
        data: reservedEmail,
        error: reservedError?.message ?? null,
      },
      profile: {
        exists: !!profile,
        data: profile || null,
        error: profileError?.message ?? null,
      },
      isCreator: !!reservedEmail || profile?.is_creator === true,
      calculations: {
        hasReservedEmail: !!reservedEmail,
        profileIsCreator: profile?.is_creator === true,
      }
    })
  } catch (err: any) {
    console.error('[debug-creator] Error:', err)
    return json({ error: err?.message ?? String(err), stack: err?.stack }, 500)
  }
}
