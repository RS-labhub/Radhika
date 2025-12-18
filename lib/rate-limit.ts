import { createServerSupabaseClient } from "./supabase/server"

interface RateLimitConfig {
  maxRequests: number
  windowMs: number // in milliseconds
}

const GUEST_RATE_LIMITS: Record<string, RateLimitConfig> = {
  chat: { maxRequests: 10, windowMs: 60 * 60 * 1000 }, // 10 per hour
  image: { maxRequests: 5, windowMs: 60 * 60 * 1000 }, // 5 per hour
  speech: { maxRequests: 10, windowMs: 60 * 60 * 1000 }, // 10 per hour
  default: { maxRequests: 20, windowMs: 60 * 60 * 1000 }, // 20 per hour
}

const AUTH_RATE_LIMITS: Record<string, RateLimitConfig> = {
  chat: { maxRequests: 150, windowMs: 60 * 60 * 1000 }, // 150 per hour
  image: { maxRequests: 50, windowMs: 60 * 60 * 1000 }, // 50 per hour
  speech: { maxRequests: 100, windowMs: 60 * 60 * 1000 }, // 100 per hour
  default: { maxRequests: 200, windowMs: 60 * 60 * 1000 }, // 200 per hour
}

// In-memory store for guest rate limiting (IP-based)
// In production, use Redis or similar
const guestRateLimitStore = new Map<string, { count: number; resetAt: number }>()

export async function checkRateLimit(
  identifier: string,
  action: string,
  isAuthenticated: boolean
): Promise<{
  allowed: boolean
  remaining: number
  resetAt: Date
  limit: number
}> {
  const limits = isAuthenticated ? AUTH_RATE_LIMITS : GUEST_RATE_LIMITS
  const config = limits[action] || limits.default

  if (isAuthenticated) {
    return checkAuthenticatedRateLimit(identifier, action, config)
  } else {
    return checkGuestRateLimit(identifier, action, config)
  }
}

async function checkAuthenticatedRateLimit(
  userId: string,
  action: string,
  config: RateLimitConfig
): Promise<{
  allowed: boolean
  remaining: number
  resetAt: Date
  limit: number
}> {
  const supabase = (await createServerSupabaseClient()) as any
  const now = new Date()
  const windowStart = new Date(now.getTime() - config.windowMs)

  // Use a composite identifier (userId:action) so we can track per-action limits
  const compositeIdentifier = `${userId}:${action}`

  // Get or create rate limit record
  const { data: existing, error: fetchError } = await supabase
    .from("rate_limits")
    .select("*")
    .eq("identifier", compositeIdentifier)
    .single()

  if (fetchError && fetchError.code !== "PGRST116") {
    // PGRST116 is "not found"
    console.error("Error fetching rate limit:", fetchError)
    // Allow request if we can't check rate limit
    return {
      allowed: true,
      remaining: config.maxRequests,
      resetAt: new Date(now.getTime() + config.windowMs),
      limit: config.maxRequests,
    }
  }

  if (!existing) {
    // Create new rate limit record
    const resetAt = new Date(now.getTime() + config.windowMs)
    await supabase.from("rate_limits").insert({
      identifier: compositeIdentifier,
      request_count: 1,
      window_start: now.toISOString(),
    })

    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt,
      limit: config.maxRequests,
    }
  }

  // Check if window has expired
  const existingWindowStart = new Date(existing.window_start)
  if (existingWindowStart < windowStart) {
    // Reset the window
    const resetAt = new Date(now.getTime() + config.windowMs)
    await supabase
      .from("rate_limits")
      .update({
        request_count: 1,
        window_start: now.toISOString(),
      })
      .eq("id", existing.id)

    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt,
      limit: config.maxRequests,
    }
  }

  // Compute reset time based on stored window_start + windowMs
  const resetAtFromRow = new Date(new Date(existing.window_start).getTime() + config.windowMs)

  // Check if limit exceeded
  if ((existing.request_count ?? 0) >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: resetAtFromRow,
      limit: config.maxRequests,
    }
  }

  // Increment count
  await supabase
    .from("rate_limits")
    .update({ request_count: (existing.request_count ?? 0) + 1 })
    .eq("id", existing.id)

  return {
    allowed: true,
    remaining: config.maxRequests - (existing.request_count ?? 0) - 1,
    resetAt: resetAtFromRow,
    limit: config.maxRequests,
  }
}

function checkGuestRateLimit(
  ip: string,
  action: string,
  config: RateLimitConfig
): {
  allowed: boolean
  remaining: number
  resetAt: Date
  limit: number
} {
  const key = `${ip}:${action}`
  const now = Date.now()
  const resetAt = new Date(now + config.windowMs)

  const existing = guestRateLimitStore.get(key)

  if (!existing || existing.resetAt < now) {
    // Create or reset
    guestRateLimitStore.set(key, { count: 1, resetAt: resetAt.getTime() })
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt,
      limit: config.maxRequests,
    }
  }

  if (existing.count >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(existing.resetAt),
      limit: config.maxRequests,
    }
  }

  existing.count++
  return {
    allowed: true,
    remaining: config.maxRequests - existing.count,
    resetAt: new Date(existing.resetAt),
    limit: config.maxRequests,
  }
}

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now()
  for (const [key, value] of guestRateLimitStore.entries()) {
    if (value.resetAt < now) {
      guestRateLimitStore.delete(key)
    }
  }
}, 5 * 60 * 1000) // Clean up every 5 minutes

export function getRateLimitHeaders(
  remaining: number,
  resetAt: Date,
  limit: number
): Record<string, string> {
  return {
    "X-RateLimit-Limit": limit.toString(),
    "X-RateLimit-Remaining": remaining.toString(),
    "X-RateLimit-Reset": Math.ceil(resetAt.getTime() / 1000).toString(),
  }
}
