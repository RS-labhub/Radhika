// AI model configurations for different providers

export const MODELS = {
  groq: {
    fast: "llama-3.1-8b-instant", // Quick responses, casual chat
    reasoning: "llama-3.3-70b-versatile", // Complex analysis, problem-solving
    creative: "openai/gpt-oss-120b", // Creative tasks, brainstorming  
  },
  gemini: {
    default: "gemini-2.5-flash",
  },
  openai: {
    default: "gpt-5",
    turbo: "gpt-4-turbo",
    fast: "gpt-4o-mini",
  },
  claude: {
    default: "claude-opus-4-1-20250805",
    sonnet: "claude-sonnet-4-5-20250929",
    haiku: "claude-haiku-4-5-20251001",
  },
}
