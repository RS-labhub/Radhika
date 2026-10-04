import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

let browserClient: SupabaseClient | null = null

export function createClient(): SupabaseClient {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export function getSupabaseClient(): SupabaseClient {
  if (!browserClient) {
    browserClient = createClient()
  }
  return browserClient
}

export function resetSupabaseClient(): void {
  browserClient = null
}
