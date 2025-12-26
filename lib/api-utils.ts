/*
 * API Utility functions for optimized database operations
 * Includes timeout handling, retry logic, and connection recovery
*/

import { NextResponse } from "next/server"

// Default timeout for database operations (10 seconds)
export const DEFAULT_TIMEOUT = 10000

// Maximum retries for failed operations
export const MAX_RETRIES = 2

// Delay between retries (exponential backoff)
export const RETRY_DELAY = 1000

/**
 * Execute a promise with a timeout
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = DEFAULT_TIMEOUT,
  operationName: string = "Operation"
): Promise<T> {
  let timeoutId: NodeJS.Timeout

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${operationName} timed out after ${timeoutMs}ms`))
    }, timeoutMs)
  })

  try {
    const result = await Promise.race([promise, timeoutPromise])
    clearTimeout(timeoutId!)
    return result
  } catch (error) {
    clearTimeout(timeoutId!)
    throw error
  }
}

/**
 * Execute with retry logic and exponential backoff
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
  baseDelay: number = RETRY_DELAY,
  operationName: string = "Operation"
): Promise<T> {
  let lastError: Error | undefined

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error as Error
      
      // Don't retry on auth errors or validation errors
      if (isNonRetryableError(error)) {
        throw error
      }

      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt)
        console.warn(
          `${operationName} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms:`,
          (error as Error).message
        )
        await sleep(delay)
      }
    }
  }

  throw lastError
}

/**
 * Combine timeout and retry for robust API calls
 */
export async function robustQuery<T>(
  operation: () => Promise<T>,
  options: {
    timeout?: number
    maxRetries?: number
    operationName?: string
  } = {}
): Promise<T> {
  const {
    timeout = DEFAULT_TIMEOUT,
    maxRetries = MAX_RETRIES,
    operationName = "Database query"
  } = options

  return withRetry(
    () => withTimeout(operation(), timeout, operationName),
    maxRetries,
    RETRY_DELAY,
    operationName
  )
}

/**
 * Check if error should not be retried
 */
function isNonRetryableError(error: any): boolean {
  if (!error) return false
  
  const message = error.message?.toLowerCase() || ""
  const code = error.code || ""
  
  // Don't retry auth errors
  if (code === "401" || code === "403" || message.includes("unauthorized")) {
    return true
  }
  
  // Don't retry validation errors
  if (code === "400" || message.includes("invalid") || message.includes("required")) {
    return true
  }
  
  // Don't retry not found errors
  if (code === "404" || code === "PGRST116") {
    return true
  }
  
  return false
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Create a standard error response
 */
export function errorResponse(
  message: string,
  status: number = 500,
  details?: any
): NextResponse {
  console.error(`API Error [${status}]:`, message, details || "")
  return NextResponse.json(
    { 
      error: message,
      ...(process.env.NODE_ENV === "development" && details ? { details } : {})
    },
    { status }
  )
}

/**
 * Create a standard success response
 */
export function successResponse<T>(data: T, status: number = 200): NextResponse {
  return NextResponse.json(data, { status })
}

/**
 * Cache headers for API responses
 */
export const CACHE_HEADERS = {
  // No caching for dynamic data
  noCache: {
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "Pragma": "no-cache",
  },
  // Short cache for semi-static data
  shortCache: {
    "Cache-Control": "private, max-age=60, stale-while-revalidate=30",
  },
  // Longer cache for mostly static data
  longCache: {
    "Cache-Control": "private, max-age=300, stale-while-revalidate=60",
  },
}
