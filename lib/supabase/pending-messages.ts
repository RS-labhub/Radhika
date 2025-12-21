export type PendingMessage = {
  id: string
  chatId: string
  userId?: string
  role: "user" | "assistant" | "system"
  content: string
  metadata?: Record<string, any> | null
  createdAt: string
  attempts: number
  lastAttemptAt?: string
}

const STORAGE_KEY = "radhika-pending-messages-v1"
const MAX_PENDING = 500

const isBrowser = () => typeof window !== "undefined" && typeof localStorage !== "undefined"

const safeParse = (raw: string | null) => {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const normalizePending = (item: any): PendingMessage | null => {
  if (!item || typeof item !== "object") return null
  if (typeof item.id !== "string" || typeof item.chatId !== "string") return null
  if (typeof item.content !== "string") return null
  if (item.role !== "user" && item.role !== "assistant" && item.role !== "system") return null
  const userId = typeof item.userId === "string" ? item.userId : undefined
  const createdAt = typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString()
  const attempts = Number.isFinite(item.attempts) ? Number(item.attempts) : 0
  const lastAttemptAt = typeof item.lastAttemptAt === "string" ? item.lastAttemptAt : undefined
  return {
    id: item.id,
    chatId: item.chatId,
    userId,
    role: item.role,
    content: item.content,
    metadata: item.metadata && typeof item.metadata === "object" ? item.metadata : undefined,
    createdAt,
    attempts,
    lastAttemptAt,
  }
}

const readAll = (): PendingMessage[] => {
  if (!isBrowser()) return []
  const raw = localStorage.getItem(STORAGE_KEY)
  const parsed = safeParse(raw)
  const normalized: PendingMessage[] = []
  for (const item of parsed) {
    const next = normalizePending(item)
    if (next) normalized.push(next)
  }
  return normalized
}

const writeAll = (items: PendingMessage[]) => {
  if (!isBrowser()) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    // Ignore storage failures (quota, privacy mode).
  }
}

const getKey = (item: { id: string; chatId: string }) => `${item.chatId}:${item.id}`

export const getPendingMessages = (chatId?: string, userId?: string) => {
  const items = readAll()
  let filtered = chatId ? items.filter((item) => item.chatId === chatId) : items
  if (userId) {
    filtered = filtered.filter((item) => item.userId === userId)
  }
  return filtered.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export const addPendingMessage = (message: PendingMessage) => {
  if (!message?.id || !message?.chatId || !message?.content) return
  const items = readAll()
  const key = getKey(message)
  const existing = items.find((item) => getKey(item) === key)
  if (existing) return

  const next: PendingMessage = {
    ...message,
    attempts: Number.isFinite(message.attempts) ? message.attempts : 0,
  }

  const updated = [...items, next]
  if (updated.length > MAX_PENDING) {
    updated.splice(0, updated.length - MAX_PENDING)
  }
  writeAll(updated)
}

export const updatePendingMessage = (
  id: string,
  chatId: string,
  updates: Partial<PendingMessage>
) => {
  const items = readAll()
  const key = `${chatId}:${id}`
  let changed = false
  const updated = items.map((item) => {
    if (`${item.chatId}:${item.id}` !== key) return item
    changed = true
    return { ...item, ...updates }
  })
  if (changed) writeAll(updated)
}

export const removePendingMessages = (keys: Array<{ id: string; chatId: string }>) => {
  if (keys.length === 0) return
  const removeSet = new Set(keys.map(getKey))
  const items = readAll()
  const filtered = items.filter((item) => !removeSet.has(getKey(item)))
  writeAll(filtered)
}

export const clearPendingMessages = (chatId?: string) => {
  if (!chatId) {
    writeAll([])
    return
  }
  const items = readAll()
  const filtered = items.filter((item) => item.chatId !== chatId)
  writeAll(filtered)
}
