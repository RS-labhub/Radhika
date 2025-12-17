import { checkRateLimit, getRateLimitHeaders } from "@/lib/rate-limit"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { SYSTEM_PROMPTS } from "@/lib/chat/system-prompts"
import { createPersonalizedPrompt, type UserGender, type UserAge } from "@/lib/chat/personalization"
import { handleGeminiRequest } from "./providers/gemini"
import { handleOpenAIRequest } from "./providers/openai"
import { handleClaudeRequest } from "./providers/claude"
import { handleGroqRequest } from "./providers/groq"

// Allow streaming responses up to 60 seconds for complex reasoning
export const maxDuration = 60

export async function POST(req: Request) {
  try {
    console.log("=== Chat API Request Started ===")

    // Check authentication and rate limiting
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    // Get identifier for rate limiting (user ID or IP)
    const identifier = user?.id || req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "anonymous"
    const isAuthenticated = !!user

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

    const { messages, mode = "general", provider = "groq", apiKey, model, userGender = "boy", userAge = "teenage", conversationTone } = body

    // Validate messages
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      console.error("Invalid messages:", { messages, type: typeof messages })
      return Response.json({ error: "Invalid messages format: Messages must be a non-empty array" }, { status: 400 })
    }

    // Fetch user personalization data from database if authenticated
    let userName: string | undefined
    let petName: string | undefined
    let dbGender: string | undefined
    let dbAge: string | undefined
    let dbTone: string | undefined

    if (user) {
      try {
        // Fetch user data (name, pet_name)
        const { data: userData, error: userError } = await supabase
          .from("users")
          .select("display_name, pet_name")
          .eq("id", user.id)
          .single()

        if (!userError && userData) {
          userName = (userData as any).display_name
          petName = (userData as any).pet_name
        }

        // Fallback to auth metadata or email if display_name is not set
        if (!userName) {
          // Try user_metadata first
          userName = (user as any).user_metadata?.display_name || 
                     (user as any).user_metadata?.name || 
                     (user as any).user_metadata?.full_name
          
          // If still no name, extract from email (e.g., "john.doe@example.com" -> "John Doe")
          if (!userName && user.email) {
            const emailName = user.email.split('@')[0]
            // Convert "john.doe" or "john_doe" to "John Doe"
            userName = emailName
              .replace(/[._-]/g, ' ')
              .split(' ')
              .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
              .join(' ')
          }
        }

        // Fetch user settings (gender, age, tone)
        const { data: settingsData, error: settingsError } = await supabase
          .from("user_settings")
          .select("gender, age, personalization")
          .eq("user_id", user.id)
          .single()

        if (!settingsError && settingsData) {
          dbGender = (settingsData as any).gender
          dbAge = (settingsData as any).age
          // Check if tone is in personalization JSONB
          const personalization = (settingsData as any).personalization
          if (personalization && typeof personalization === 'object' && personalization.tone) {
            dbTone = personalization.tone
          }
        }
      } catch (err) {
        console.error("Failed to fetch user personalization:", err)
        // Fallback to auth metadata even on error
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

    // Use database values if available, otherwise fall back to request body
    const finalGender = (dbGender || userGender) as UserGender
    const finalAge = (dbAge || userAge) as UserAge
    const finalTone = dbTone || conversationTone

    // Get base prompt and personalize it
    const basePrompt = SYSTEM_PROMPTS[mode as keyof typeof SYSTEM_PROMPTS] || SYSTEM_PROMPTS.general
    const recentUserMessages = (messages || [])
      .filter((m: any) => m?.role === "user" && typeof m?.content === "string")
      .slice(-6)
      .map((m: any) => String(m.content))

    const systemPrompt = createPersonalizedPrompt(
      basePrompt,
      finalGender,
      finalAge,
      finalTone,
      userName,
      petName,
      recentUserMessages
    )
    
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
