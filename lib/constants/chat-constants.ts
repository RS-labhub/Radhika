import {
  Brain,
  Heart,
  BookOpen,
  Lightbulb,
  Users,
  Target,
} from "lucide-react"

import type { KeyProvider, KeyProviderMetadata, Mode, ModeDefinition, Provider, ProviderDefinition } from "@/types/chat"

// Mode definitions with icons, colors, and styling
export const MODES: Record<Mode, ModeDefinition> = {
  general: {
    icon: Brain,
    label: "General",
    description: "Versatile assistance for everyday questions.",
    placeholder: "Ask me anything...",
    color: "text-cyan-600 dark:text-cyan-400",
    bg: "bg-cyan-100/50 dark:bg-cyan-950/30",
    bgPixel: "bg-cyan-100 dark:bg-cyan-900/30",
    border: "border-cyan-300 dark:border-cyan-500/30",
    borderPixel: "border-cyan-400 dark:border-cyan-500",
    gradient: "from-cyan-500 to-blue-600",
    glow: "shadow-cyan-500/20",
  },
  productivity: {
    icon: Target,
    label: "Productivity",
    description: "Structure goals, tasks, and workstreams with clarity.",
    placeholder: "How can I help you be more productive?",
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-100/50 dark:bg-emerald-950/30",
    bgPixel: "bg-emerald-100 dark:bg-emerald-900/30",
    border: "border-emerald-300 dark:border-emerald-500/30",
    borderPixel: "border-emerald-400 dark:border-emerald-500",
    gradient: "from-emerald-500 to-teal-600",
    glow: "shadow-emerald-500/20",
  },
  wellness: {
    icon: Heart,
    label: "Wellness",
    description: "Support for habits, mindfulness, and wellbeing routines.",
    placeholder: "What wellness topic can I help with?",
    color: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-100/50 dark:bg-rose-950/30",
    bgPixel: "bg-rose-100 dark:bg-rose-900/30",
    border: "border-rose-300 dark:border-rose-500/30",
    borderPixel: "border-rose-400 dark:border-rose-500",
    gradient: "from-rose-500 to-pink-600",
    glow: "shadow-rose-500/20",
  },
  learning: {
    icon: BookOpen,
    label: "Learning",
    description: "Break down concepts and craft study plans with ease.",
    placeholder: "What would you like to learn?",
    color: "text-purple-600 dark:text-purple-400",
    bg: "bg-purple-100/50 dark:bg-purple-950/30",
    bgPixel: "bg-purple-100 dark:bg-purple-900/30",
    border: "border-purple-300 dark:border-purple-500/30",
    borderPixel: "border-purple-400 dark:border-purple-500",
    gradient: "from-purple-500 to-indigo-600",
    glow: "shadow-purple-500/20",
  },
  creative: {
    icon: Lightbulb,
    label: "Creative",
    description: "Generate ideas, stories, and fresh perspectives.",
    placeholder: "Let's brainstorm something creative...",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-100/50 dark:bg-amber-950/30",
    bgPixel: "bg-amber-100 dark:bg-amber-900/30",
    border: "border-amber-300 dark:border-amber-500/30",
    borderPixel: "border-amber-400 dark:border-amber-500",
    gradient: "from-amber-500 to-orange-600",
    glow: "shadow-amber-500/20",
  },
  bff: {
    icon: Users,
    label: "BFF",
    description: "Gen Z bestie energy for playful, real talk exchanges.",
    placeholder: "Hey bestie, what's up?",
    color: "text-pink-600 dark:text-pink-400",
    bg: "bg-pink-100/50 dark:bg-pink-950/30",
    bgPixel: "bg-pink-100 dark:bg-pink-900/30",
    border: "border-pink-300 dark:border-pink-500/30",
    borderPixel: "border-pink-400 dark:border-pink-500",
    gradient: "from-pink-500 to-rose-600",
    glow: "shadow-pink-500/20",
  },
}

// Provider definitions
export const PROVIDERS: Record<Provider, ProviderDefinition> = {
  groq: {
    name: "Groq",
    description: "Fast and efficient LLM",
    models: ["llama-3.1-8b-instant", "llama-3.3-70b-versatile", "qwen/qwen3-32b"],
    requiresApiKey: false,
    color: "pink",
  },
  gemini: {
    name: "Gemini",
    description: "Google's multimodal AI",
    models: ["gemini-2.5-flash"],
    requiresApiKey: false,
    color: "emerald",
  },
  openai: {
    name: "OpenAI",
    description: "Advanced language models",
    models: ["gpt-5", "gpt-4-turbo", "gpt-3.5-turbo"],
    requiresApiKey: true,
    color: "violet",
  },
  claude: {
    name: "Claude",
    description: "Anthropic's helpful assistant",
    models: ["claude-opus-4-1-20250805", "claude-opus-4-1", "claude-3-haiku"],
    requiresApiKey: true,
    color: "orange",
  },
}

// Metadata for key providers (used in API key dialog)
export const KEY_PROVIDER_METADATA: Record<KeyProvider, KeyProviderMetadata> = {
  groq: {
    name: PROVIDERS.groq.name,
    description: PROVIDERS.groq.description,
  },
  gemini: {
    name: PROVIDERS.gemini.name,
    description: PROVIDERS.gemini.description,
  },
  openai: {
    name: PROVIDERS.openai.name,
    description: PROVIDERS.openai.description,
  },
  claude: {
    name: PROVIDERS.claude.name,
    description: PROVIDERS.claude.description,
  },
  huggingface: {
    name: "Hugging Face",
    description: "Image generation with FLUX.1 Schnell and Stable Diffusion XL models",
  },
}

// Quick actions for each mode
export const QUICK_ACTIONS: Record<Mode, string[]> = {
  general: ["Help me make a decision", "Explain a complex topic", "Give advice on a situation", "Guide me step by step"],
  productivity: ["Plan my day effectively", "Break down a project", "Prioritize my tasks", "Time management tips"],
  wellness: ["Morning routine ideas", "Stress management techniques", "Healthy habit suggestions", "Workout planning"],
  learning: ["Explain a concept", "Create a study plan", "Recommend resources", "Give practice exercises"],
  creative: ["Brainstorm new ideas", "Generate creative prompts", "Outline a project", "Help me overcome a block"],
  bff: ["What's the tea?", "I need motivation", "Help me with drama", "Let's chat about life"],
}

// Storage keys
export const STORAGE_KEYS = {
  IMAGE_SETTINGS: "radhika-image-settings",
  LEGACY_IMAGE_PROVIDER_KEYS: "radhika-image-provider-keys",
  PERSONALIZATION: "radhika-personalization",
  UI_STYLE: "radhika-ui-style",
  ADMIN_STATUS: "radhika-admin-status",
} as const

// Mode colors for badges (used in dashboard, admin, etc.)
export const MODE_BADGE_COLORS: Record<string, string> = {
  general: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  productivity: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  wellness: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200",
  learning: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  creative: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  bff: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
}

// Mode text colors (used in dashboard)
export const MODE_TEXT_COLORS: Record<string, string> = {
  general: "text-cyan-600 dark:text-cyan-400",
  productivity: "text-emerald-600 dark:text-emerald-400",
  wellness: "text-rose-600 dark:text-rose-400",
  learning: "text-purple-600 dark:text-purple-400",
  creative: "text-amber-600 dark:text-amber-400",
  bff: "text-pink-600 dark:text-pink-400",
}
