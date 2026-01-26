import { checkRateLimit, getRateLimitHeaders } from "@/lib/rate-limit"
import { createServerAppwriteClient, createServiceClient, Query } from "@/lib/appwrite/server"
import { APPWRITE_CONFIG } from "@/lib/appwrite/config"
import { SYSTEM_PROMPTS, CORE_SYSTEM_PROMPT, CREATOR_BOYFRIEND_PROMPT } from "@/lib/chat/system-prompts"
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

    // Check authentication and rate limiting using Appwrite
    const { account, databases, userId: cookieUserId } = await createServerAppwriteClient()
    const serviceClient = createServiceClient()
    
    let user: { $id: string; email?: string } | null = null
    try {
      user = await account.get()
    } catch {
      // Not authenticated via session - check if we have user ID from cookie or header
      const headerUserId = req.headers.get('x-user-id')
      const fallbackUserId = headerUserId || cookieUserId
      
      if (fallbackUserId) {
        try {
          // Validate user exists using service client
          const validatedUser = await serviceClient.users.get(fallbackUserId)
          user = { $id: validatedUser.$id, email: validatedUser.email }
        } catch {
          // Invalid user ID, continue as guest
        }
      }
    }
    
    // Get identifier for rate limiting (user ID or IP)
    const identifier = user?.$id || req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "anonymous"
    const isAuthenticated = !!user

    // Check whether this user is the reserved creator (server-side)
    let isCreator = false
    if (user?.$id) {
      try {
        const userEmail = user.email?.toLowerCase()
        
        // Check reserved_emails collection using service client (bypasses permissions)
        try {
          const reservedEmails = await serviceClient.databases.listDocuments(
            APPWRITE_CONFIG.databaseId,
            APPWRITE_CONFIG.collections.reservedEmails,
            [Query.equal('email', userEmail || '')]
          )
          
          if (reservedEmails.documents.length > 0) {
            isCreator = true
          }
        } catch {
          // Reserved emails collection may not exist
        }
        
        // Also check profile
        if (!isCreator) {
          try {
            const profiles = await databases.listDocuments(
              APPWRITE_CONFIG.databaseId,
              APPWRITE_CONFIG.collections.profiles,
              [Query.equal('$id', user.$id)]
            )
            
            if (profiles.documents.length > 0 && profiles.documents[0].is_creator) {
              isCreator = true
            }
          } catch {
            // Profile may not exist
          }
        }
        
        console.log('[chat] Creator check:', { 
          email: userEmail, 
          isCreator 
        })
      } catch (e) {
        console.error('[chat] Failed to check creator status:', e)
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

    // Fetch user personalization data from database if authenticated
    let userName: string | undefined
    let petName: string | undefined
    let dbGender: string | undefined
    let dbAge: string | undefined
    let dbTone: string | undefined

    if (user) {
      try {
        // Fetch user data (name, pet_name) from Appwrite using service client
        try {
          // Use getDocument with the user's ID (since document ID = user ID)
          const userData = await serviceClient.databases.getDocument(
            APPWRITE_CONFIG.databaseId,
            APPWRITE_CONFIG.collections.users,
            user.$id
          )
          
          if (userData) {
            userName = userData.display_name
            petName = userData.pet_name
            console.log('[chat] User profile found:', { userName, petName })
          }
        } catch (e: any) {
          // User document may not exist yet
          console.log('[chat] User document not found:', e?.message)
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

        // Fetch user settings (gender, age, tone) from Appwrite using service client
        try {
          const settings = await serviceClient.databases.listDocuments(
            APPWRITE_CONFIG.databaseId,
            APPWRITE_CONFIG.collections.userSettings,
            [Query.equal('user_id', user.$id)]
          )
          
          if (settings.documents.length > 0) {
            const settingsData = settings.documents[0]
            dbGender = settingsData.gender
            dbAge = settingsData.age
            // First check the individual tone field, then fallback to personalization JSON
            dbTone = settingsData.tone
            if (!dbTone) {
              const personalization = settingsData.personalization
              if (personalization) {
                try {
                  const parsedPersonalization = typeof personalization === 'string' 
                    ? JSON.parse(personalization) 
                    : personalization
                  if (parsedPersonalization?.tone) {
                    dbTone = parsedPersonalization.tone
                  }
                } catch {
                  // Ignore parse errors
                }
              }
            }
            console.log('[chat] User settings found:', { gender: dbGender, age: dbAge, tone: dbTone })
          }
        } catch (e: any) {
          // Settings may not exist yet
          console.log('[chat] User settings not found:', e?.message)
        }
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
