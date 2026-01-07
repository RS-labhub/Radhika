import { groq, createGroq } from "@ai-sdk/groq"
import { streamText } from "ai"
import { MODELS } from "@/lib/chat/models"

export async function handleGroqRequest(
  systemPrompt: string,
  messages: any[],
  mode: string,
  apiKey?: string,
  model?: string
) {
  const groqApiKey = apiKey || process.env.GROQ_API_KEY
  if (!groqApiKey) {
    console.error("GROQ_API_KEY environment variable is not set")
    throw new Error("API configuration error: GROQ_API_KEY is not configured")
  }

  // Determine which model to use based on the conversation context
  let modelType = "fast"
  const lastMessageContent = messages[messages.length - 1]?.content
  const normalizedLast = typeof lastMessageContent === "string"
    ? lastMessageContent
    : JSON.stringify(lastMessageContent ?? "")
  const lastMessage = normalizedLast.toLowerCase()

  // Use reasoning model for complex tasks
  if (
    lastMessage.includes("analyze") ||
    lastMessage.includes("compare") ||
    lastMessage.includes("plan") ||
    lastMessage.includes("strategy") ||
    lastMessage.includes("decision") ||
    lastMessage.includes("problem")
  ) {
    modelType = "reasoning"
  }

  // Use creative model for creative tasks
  if (
    lastMessage.includes("creative") ||
    lastMessage.includes("brainstorm") ||
    lastMessage.includes("idea") ||
    lastMessage.includes("write") ||
    lastMessage.includes("design") ||
    lastMessage.includes("story")
  ) {
    modelType = "creative"
  }

  const selectedModel = (model as string) || MODELS.groq[modelType as keyof typeof MODELS.groq]

  console.log("AI Configuration:", {
    mode,
    modelType,
    selectedModel,
    systemPromptLength: systemPrompt.length,
  })

  // Create the AI request (user key overrides default)
  const groqClient = apiKey ? createGroq({ apiKey: groqApiKey }) : groq
  const result = await streamText({
    model: groqClient(selectedModel),
    system: systemPrompt,
    messages,
    temperature: modelType === "creative" ? 0.8 : mode === "bff" ? 0.9 : 0.7,
  })

  console.log("Groq request successful, streaming response")
  return result.toTextStreamResponse()
}
