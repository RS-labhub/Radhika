import { checkRateLimit, getRateLimitHeaders } from "@/lib/rate-limit"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthenticatedUser, isReservedEmail } from "@/lib/api-utils"
import { SYSTEM_PROMPTS, CORE_SYSTEM_PROMPT, CREATOR_BOYFRIEND_PROMPT } from "@/lib/chat/system-prompts"
import { createPersonalizedPrompt, type UserGender, type UserAge } from "@/lib/chat/personalization"
import { handleGeminiRequest } from "./providers/gemini"
import { handleOpenAIRequest } from "./providers/openai"
import { handleClaudeRequest } from "./providers/claude"
import { handleGroqRequest } from "./providers/groq"

// Allow streaming responses up to 60 seconds for complex reasoning
export const maxDuration = 60

// In-memory caches for reducing DB calls (server-side)
const creatorCache = new Map<string, { isCreator: boolean; timestamp: number }>()
const userDataCache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

function getCachedCreatorStatus(userId: string): boolean | null {
  const cached = creatorCache.get(userId)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.isCreator
  }
  return null
}

function setCachedCreatorStatus(userId: string, isCreator: boolean): void {
  creatorCache.set(userId, { isCreator, timestamp: Date.now() })
}

function getCachedUserData(userId: string): any | null {
  const cached = userDataCache.get(userId)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data
  }
  return null
}

function setCachedUserData(userId: string, data: any): void {
  userDataCache.set(userId, { data, timestamp: Date.now() })
}

export async function POST(req: Request) {
  try {
    console.log("=== Chat API Request Started ===")

    const user = await getAuthenticatedUser()
    const supabase = createServiceRoleClient()

    // Get identifier for rate limiting (user ID or IP)
    const identifier = user?.id || req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "anonymous"
    const isAuthenticated = !!user

    // Check whether this user is the reserved creator (server-side) - with caching
    let isCreator = false
    if (user?.id) {
      // Check cache first
      const cachedCreatorStatus = getCachedCreatorStatus(user.id)
      if (cachedCreatorStatus !== null) {
        isCreator = cachedCreatorStatus
        console.log('[chat] Creator status (cached):', isCreator)
      } else {
        try {
          const userEmail = user.email?.toLowerCase()

          isCreator = await isReservedEmail(userEmail)

          if (!isCreator) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('is_creator')
              .eq('id', user.id)
              .maybeSingle()
            if (profile?.is_creator) {
              isCreator = true
            }
          }

          setCachedCreatorStatus(user.id, isCreator)
          
          console.log('[chat] Creator check (from DB):', { 
            email: userEmail, 
            isCreator 
          })
        } catch (e) {
          console.error('[chat] Failed to check creator status:', e)
        }
      }
    }

    // Check rate limit
    const rateLimitResult = await checkRateLimit(identifier, "chat", isAuthenticated)
    
    if (!rateLimitResult.allowed) {
      const headers = getRateLimitHeaders(
        rateLimitResult.remaining,
        rateLimitResult.resetAt,
        rateLimitResult.limit
      )
      return Response.json(
        { 
          error: "Rate limit exceeded. Please wait before sending more messages.",
          resetAt: rateLimitResult.resetAt.toISOString(),
          isGuest: !isAuthenticated
        },
        { status: 429, headers }
      )
    }

    // Parse request body
    let body
    try {
      body = await req.json()
    } catch (parseError) {
      console.error("Failed to parse request body:", parseError)
      return Response.json({ error: "Invalid request format: Request body must be valid JSON" }, { status: 400 })
    }

    const { messages, mode = "general", provider = "groq", apiKey, model, userGender = "male", userAge = "teenage", conversationTone } = body

    // Validate messages
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      console.error("Invalid messages:", { messages, type: typeof messages })
      return Response.json({ error: "Invalid messages format: Messages must be a non-empty array" }, { status: 400 })
    }

    // Fetch user personalization data from database if authenticated - with caching
    let userName: string | undefined
    let petName: string | undefined
    let dbGender: string | undefined
    let dbAge: string | undefined
    let dbTone: string | undefined

    if (user) {
      // Check cache first
      const cachedUserData = getCachedUserData(user.id)
      if (cachedUserData) {
        userName = cachedUserData.userName
        petName = cachedUserData.petName
        dbGender = cachedUserData.gender
        dbAge = cachedUserData.age
        dbTone = cachedUserData.tone
        console.log('[chat] User data (cached):', { userName, petName, gender: dbGender, age: dbAge, tone: dbTone })
      } else {
        try {
          const { data: userData } = await supabase
            .from('users')
            .select('display_name, pet_name')
            .eq('id', user.id)
            .maybeSingle()

          if (userData) {
            userName = userData.display_name ?? undefined
            petName = userData.pet_name ?? undefined
            console.log('[chat] User profile found:', { userName, petName })
          }

          // Fallback to email if display_name is not set
          if (!userName && user.email) {
            const emailName = user.email.split('@')[0]
            // Convert "john.doe" or "john_doe" to "John Doe"
            userName = emailName
              .replace(/[._-]/g, ' ')
              .split(' ')
              .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
              .join(' ')
            console.log('[chat] Using email-derived name:', userName)
          }

          const { data: settingsData } = await supabase
            .from('user_settings')
            .select('gender, age, tone, personalization')
            .eq('user_id', user.id)
            .maybeSingle()

          if (settingsData) {
            dbGender = settingsData.gender ?? undefined
            dbAge = settingsData.age ?? undefined
            dbTone = settingsData.tone || settingsData.personalization?.tone || undefined
            console.log('[chat] User settings found:', { gender: dbGender, age: dbAge, tone: dbTone })
          }

          setCachedUserData(user.id, { userName, petName, gender: dbGender, age: dbAge, tone: dbTone })
        } catch (err) {
          console.error("Failed to fetch user personalization:", err)
          // Fallback to email even on error
          if (!userName && user.email) {
            const emailName = user.email.split('@')[0]
            userName = emailName
              .replace(/[._-]/g, ' ')
              .split(' ')
              .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
              .join(' ')
          }
        }
      }
    }

    // Use database values if available, otherwise fall back to request body
    const finalGender = (dbGender || userGender) as UserGender
    const finalAge = (dbAge || userAge) as UserAge
    const finalTone = dbTone || conversationTone

    // Get system prompt
    // If the user is the reserved creator, use the special boyfriend prompt
    let systemPrompt: string
    if (isCreator) {
      systemPrompt = CREATOR_BOYFRIEND_PROMPT
      console.log('[chat] Using CREATOR_BOYFRIEND_PROMPT for owner')
    } else {
      const basePrompt = SYSTEM_PROMPTS[mode as keyof typeof SYSTEM_PROMPTS] || SYSTEM_PROMPTS.general
      const recentUserMessages = (messages || [])
        .filter((m: any) => m?.role === "user" && typeof m?.content === "string")
        .slice(-6)
        .map((m: any) => String(m.content))

      systemPrompt = createPersonalizedPrompt(
        basePrompt,
        finalGender,
        finalAge,
        finalTone,
        userName,
        petName,
        recentUserMessages
      )
    }
    
    console.log("User personalization:", { 
      userName, 
      petName, 
      gender: finalGender, 
      age: finalAge,
      tone: finalTone,
      source: user ? 'database' : 'request'
    })
    console.log("Rate limit status:", { remaining: rateLimitResult.remaining, isAuthenticated })

    // Route to appropriate provider handler
    try {
      if (provider === "gemini") {
        return await handleGeminiRequest(systemPrompt, messages, mode, apiKey, model)
      } else if (provider === "openai") {
        return await handleOpenAIRequest(systemPrompt, messages, mode, apiKey, model)
      } else if (provider === "claude") {
        return await handleClaudeRequest(systemPrompt, messages, mode, apiKey, model)
      } else if (provider === "groq") {
        return await handleGroqRequest(systemPrompt, messages, mode, apiKey, model)
      } else {
        return Response.json({ error: `Unsupported provider: ${provider}` }, { status: 400 })
      }
    } catch (providerError) {
      console.error(`${provider} API Error:`, providerError)
      return Response.json(
        {
          error: `${provider} API Error: ${providerError instanceof Error ? providerError.message : "Unknown error"}`,
        },
        { status: 500 },
      )
    }
  } catch (error) {
    console.error("Chat API Error:", {
      name: error instanceof Error ? error.name : undefined,
      message: error instanceof Error ? error.message : undefined,
      stack: error instanceof Error ? error.stack : undefined,
      cause: error instanceof Error ? error.cause : undefined,
    })

    return Response.json(
      { error: error instanceof Error ? error.message : "An unexpected error occurred" },
      { status: 500 },
    )
  }
}
