import { createServerSupabaseClient } from '@/lib/supabase/server'
import { CORE_SYSTEM_PROMPT } from '@/lib/chat/system-prompts'

export async function GET() {
  try {
    const supabase = (await createServerSupabaseClient()) as any

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_creator, email')
      .eq('id', user.id)
      .single()

    if (profileError) {
      return new Response(JSON.stringify({ error: profileError.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }

    const isCreator = profile?.is_creator === true

    const systemPrompt = isCreator
      ? `${CORE_SYSTEM_PROMPT}\n\nYou are speaking to the creator (Rohan). Use the creator-specific voice as defined by the project.`
      : CORE_SYSTEM_PROMPT

    return new Response(JSON.stringify({ isCreator, systemPrompt, email: profile?.email ?? null }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message ?? String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
