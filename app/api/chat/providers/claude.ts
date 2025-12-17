import { createAnthropic } from "@ai-sdk/anthropic"
import { streamText } from "ai"
import { MODELS } from "@/lib/chat/models"

export async function handleClaudeRequest(
  systemPrompt: string,
  messages: any[],
  mode: string,
  apiKey?: string,
  model?: string
) {
  const claudeApiKey = apiKey
  if (!claudeApiKey) {
    console.error("Claude API key not provided")
    throw new Error("API configuration error: Claude API key is required")
  }

  // Create Anthropic client with user's API key
  const anthropicClient = createAnthropic({
    apiKey: claudeApiKey,
  })

  const modelId = (model as string) || MODELS.claude.default
  console.log("Using Claude model:", modelId)

  const result = await streamText({
    model: anthropicClient(modelId),
    system: systemPrompt,
    messages,
    temperature: mode === "creative" ? 0.8 : mode === "bff" ? 0.9 : 0.7,
  })

  console.log("Claude request successful, streaming response")
  return result.toTextStreamResponse()
}
