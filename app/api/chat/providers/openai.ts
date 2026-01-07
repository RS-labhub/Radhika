import { createOpenAI } from "@ai-sdk/openai"
import { streamText } from "ai"
import { MODELS } from "@/lib/chat/models"

export async function handleOpenAIRequest(
  systemPrompt: string,
  messages: any[],
  mode: string,
  apiKey?: string,
  model?: string
) {
  const openaiApiKey = apiKey
  if (!openaiApiKey) {
    console.error("OpenAI API key not provided")
    throw new Error("API configuration error: OpenAI API key is required")
  }

  // Create OpenAI client with user's API key
  const openaiClient = createOpenAI({
    apiKey: openaiApiKey,
  })

  const modelId = (model as string) || MODELS.openai.default
  console.log("Using OpenAI model:", modelId)

  const result = await streamText({
    model: openaiClient(modelId),
    system: systemPrompt,
    messages,
    temperature: mode === "creative" ? 0.8 : mode === "bff" ? 0.9 : 0.7,
  })

  console.log("OpenAI request successful, streaming response")
  return result.toTextStreamResponse()
}
