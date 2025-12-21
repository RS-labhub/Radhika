import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import type { Database } from "../../types/database"

type BrowserClient = ReturnType<typeof createSupabaseClient<Database>>

// Increased timeout to prevent premature aborts during slow queries
const SUPABASE_FETCH_TIMEOUT_MS = 30000 // 30 seconds

const fetchWithTimeout: typeof fetch = async (input, init) => {
  if (typeof AbortController === "undefined") {
    return fetch(input, init)
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), SUPABASE_FETCH_TIMEOUT_MS)
  const onAbort = () => controller.abort()

  if (init?.signal) {
    if (init.signal.aborted) {
      controller.abort()
    } else {
      init.signal.addEventListener("abort", onAbort, { once: true })
    }
  }

  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeoutId)
    if (init?.signal) {
      init.signal.removeEventListener("abort", onAbort)
    }
  }
}

// Singleton instance for client-side usage
let browserClient: BrowserClient | null = null
const globalForSupabase = globalThis as typeof globalThis & {
  __radhikaSupabaseClient?: BrowserClient
}

export function getSupabaseClient() {
  if (!browserClient) {
    browserClient = globalForSupabase.__radhikaSupabaseClient ?? null
    if (!browserClient) {
      browserClient = createSupabaseClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
          },
          global: {
            fetch: fetchWithTimeout,
            headers: {
              'x-client-info': 'radhika-chat',
            },
          },
          db: {
            schema: 'public',
          },
          realtime: {
            params: {
              eventsPerSecond: 10,
            },
          },
        }
      )
      globalForSupabase.__radhikaSupabaseClient = browserClient
    }
  }
  return browserClient
}

export function resetSupabaseClient() {
  browserClient = null
  if (globalForSupabase.__radhikaSupabaseClient) {
    delete globalForSupabase.__radhikaSupabaseClient
  }
  try {
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
      window.dispatchEvent(new Event("radhika:supabase:reset"))
    }
  } catch (error) {
    // Ignore dispatch errors (non-browser contexts).
  }
}

// Backwards-compatible helper for components/services that import createClient.
export function createClient() {
  return getSupabaseClient()
}
