import { createServiceRoleClient } from '@/lib/supabase/server'
import { getAuthenticatedUser, isReservedEmail } from '@/lib/api-utils'
import { CORE_SYSTEM_PROMPT, CREATOR_BOYFRIEND_PROMPT } from '@/lib/chat/system-prompts'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export async function GET() {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return json({ error: 'Not authenticated' }, 401)
    }

    const supabase = createServiceRoleClient()
    const reservedEmail = await isReservedEmail(user.email)

    let profile: { id: string; email: string | null; is_creator: boolean | null } | null = null
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, is_creator')
      .eq('id', user.id)
      .maybeSingle()
    if (profileError) {
      console.log('[check-creator] Profile check error:', profileError.message)
    }
    profile = profileData

    if (!profile) {
      const { data: created, error: insertError } = await supabase
        .from('profiles')
        .insert({
          id: user.id,
          email: user.email,
          is_creator: reservedEmail,
          updated_at: new Date().toISOString()
        })
        .select('id, email, is_creator')
        .single()

      if (insertError) {
        console.error('[check-creator] Profile insert error:', insertError)
      } else {
        const isCreator = created.is_creator === true
        return json({
          isCreator,
          systemPrompt: isCreator ? CREATOR_BOYFRIEND_PROMPT : CORE_SYSTEM_PROMPT,
          email: created.email,
          debug: { createdProfile: true, reservedEmail }
        })
      }
    }

    // Creator if listed in reserved_emails or flagged on the profile
    const isCreator = reservedEmail || profile?.is_creator === true

    return json({
      isCreator,
      systemPrompt: isCreator ? CREATOR_BOYFRIEND_PROMPT : CORE_SYSTEM_PROMPT,
      email: profile?.email ?? user.email ?? null,
      debug: { hasReservedEmail: reservedEmail, profileIsCreator: profile?.is_creator }
    })
  } catch (err: any) {
    console.error('[check-creator] Error:', err)
    return json({ error: err?.message ?? String(err) }, 500)
  }
}
