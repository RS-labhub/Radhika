import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import { CORE_SYSTEM_PROMPT, CREATOR_BOYFRIEND_PROMPT } from '@/lib/chat/system-prompts'

export async function GET() {
  try {
    const supabase = (await createServerSupabaseClient()) as any
    const serviceRole = createServiceRoleClient() // For querying reserved_emails (bypasses RLS)

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
    }

    // Check if the user's email is in the reserved_emails table
    const userEmail = user.email?.toLowerCase()
    
    console.log('[check-creator] Checking creator status for:', userEmail)
    
    // Use service role client to bypass RLS on reserved_emails table
    const { data: reservedEmail, error: reservedError } = await serviceRole
      .from('reserved_emails')
      .select('email')
      .ilike('email', userEmail || '')
      .single()

    console.log('[check-creator] Reserved email check:', { reservedEmail, reservedError })

    // Also get the profile for fallback (use regular client for profiles)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_creator, email')
      .eq('id', user.id)
      .single()

    console.log('[check-creator] Profile check:', { profile, profileError })

    // If no profile exists, create one now
    if (profileError && profileError.code === 'PGRST116') {
      console.log('[check-creator] No profile found, creating one...')
      
      const isCreatorFromEmail = !!reservedEmail
      
      const { data: newProfile, error: insertError } = await supabase
        .from('profiles')
        .insert({
          id: user.id,
          email: user.email,
          is_creator: isCreatorFromEmail
        })
        .select('is_creator, email')
        .single()

      console.log('[check-creator] Profile created:', { newProfile, insertError })

      if (!insertError && newProfile) {
        const isCreator = newProfile.is_creator === true
        const systemPrompt = isCreator ? CREATOR_BOYFRIEND_PROMPT : CORE_SYSTEM_PROMPT
        
        return new Response(JSON.stringify({ 
          isCreator, 
          systemPrompt, 
          email: newProfile.email,
          debug: { createdProfile: true, reservedEmail: !!reservedEmail }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
    }

    if (profileError && profileError.code !== 'PGRST116') {
      console.error('[check-creator] Profile error:', profileError)
      return new Response(JSON.stringify({ error: profileError.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
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
