export function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("Supabase request timeout")), timeoutMs)
  })

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId)
  })
}

const MAX_RETRIES = 0 // Disabled retries to prevent connection pool exhaustion
const RETRY_DELAY_MS = 500

const getErrorMessage = (error: unknown) => {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message || "")
  }
  return String(error ?? "")
}

const getErrorName = (error: unknown) => {
  if (error && typeof error === "object" && "name" in error) {
    return String((error as { name?: unknown }).name || "")
  }
  return ""
}

const getErrorCode = (error: unknown) => {
  if (error && typeof error === "object" && "code" in error) {
    return String((error as { code?: unknown }).code || "")
  }
  return ""
}

const getErrorStatus = (error: unknown) => {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status?: unknown }).status
    return typeof status === "number" ? status : Number(status)
  }
  return NaN
}

const isTimeoutLike = (error: unknown) => {
  const message = getErrorMessage(error).toLowerCase()
  const name = getErrorName(error).toLowerCase()
  const code = getErrorCode(error).toLowerCase()
  return (
    name === "aborterror" ||
    code === "etimedout" ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("aborted")
  )
}

const normalizeError = (error: unknown) => {
  if (isTimeoutLike(error)) {
    const message = getErrorMessage(error)
    if (message.includes("Supabase request timeout")) {
      return error
    }
    const timeoutError = new Error("Supabase request timeout")
    ;(timeoutError as { cause?: unknown }).cause = error
    return timeoutError
  }
  return error
}

const isRetryableError = (error: unknown) => {
  if (isTimeoutLike(error)) return true
  const status = getErrorStatus(error)
  if (!Number.isNaN(status) && (status === 408 || status === 429 || status >= 500)) {
    return true
  }
  const code = getErrorCode(error).toLowerCase()
  if (["econnreset", "eai_again", "enotfound", "etimedout"].includes(code)) {
    return true
  }
  const message = getErrorMessage(error).toLowerCase()
  return message.includes("failed to fetch") || message.includes("networkerror") || message.includes("network error")
}

export async function retryWithReset<T>(
  operation: () => Promise<T>,
  timeoutMs: number = 20000
): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await withTimeout(operation(), timeoutMs)
      return result
    } catch (error) {
      const normalized = normalizeError(error)
      if (attempt < MAX_RETRIES && isRetryableError(normalized)) {
        console.warn(`Supabase request failed, retrying (attempt ${attempt + 1})...`)
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))
        continue
      }
      throw normalized
    }
  }
  throw new Error("Supabase request failed after retries")
}
