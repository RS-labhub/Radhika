import { google, createGoogleGenerativeAI } from "@ai-sdk/google"
import { streamText } from "ai"
import { MODELS } from "@/lib/chat/models"

export async function handleGeminiRequest(
  systemPrompt: string,
  messages: any[],
  mode: string,
  apiKey?: string,
  model?: string
) {
  const geminiApiKey = apiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!geminiApiKey) {
    console.error("GOOGLE_GENERATIVE_AI_API_KEY not configured")
    throw new Error("API configuration error: GOOGLE_GENERATIVE_AI_API_KEY is not configured")
  }

  const geminiClient = apiKey ? createGoogleGenerativeAI({ apiKey: geminiApiKey }) : google
  const geminiModelId = (model as string) || MODELS.gemini.default
  console.log("Using Gemini model:", geminiModelId)

  const result = await streamText({
    model: geminiClient(geminiModelId),
    system: systemPrompt,
    messages,
    temperature: mode === "creative" ? 0.8 : mode === "bff" ? 0.9 : 0.7,
  })

  console.log("Gemini request successful, streaming response")
  return result.toTextStreamResponse()
}
