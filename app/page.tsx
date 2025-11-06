"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ChangeEvent, FormEvent } from "react"
import { useChat } from "@ai-sdk/react"
import type { Components } from "react-markdown"
import { Analytics } from "@vercel/analytics/react"
import { SpeedInsights } from "@vercel/speed-insights/next"
import {
  Brain,
  Heart,
  BookOpen,
  Lightbulb,
  Users,
  Target,
} from "lucide-react"

import { ChatAppShell } from "@/components/chat/app-shell"
import { SidebarNav } from "@/components/chat/sidebar-nav"
import { ChatTopbar } from "@/components/chat/topbar"
import { ChatFeed } from "@/components/chat/chat-feed"
import { ChatComposer } from "@/components/chat/chat-composer"
import { SidebarDrawer } from "@/components/chat/sidebar-drawer"
import { InsightsPanel } from "@/components/chat/insights-panel"
import { ActivityMatrix } from "@/components/activity-matrix"
import { ApiKeyDialog } from "@/components/dialog/api-key-dialog"
import { SettingsDialog } from "@/components/dialog/settings-dialog"
import { ImageSettingsDialog } from "@/components/dialog/image-settings-dialog"
import { CodeBlock } from "@/components/chat/code-block"
import { GeneratedImage } from "@/components/chat/generated-image"
import { useSpeech } from "@/hooks/use-speech"

import type { KeyProvider, KeyProviderMetadata, Mode, ModeDefinition, Provider, ProviderDefinition, UIStyle } from "@/types/chat"
import type { ImageProviderId, ImageSettings } from "@/types/image"
import { IMAGE_PROVIDERS, DEFAULT_IMAGE_PROVIDER } from "@/lib/image-providers"
import { truncate } from "fs"

const MODES: Record<Mode, ModeDefinition> = {
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

const PROVIDERS: Record<Provider, ProviderDefinition> = {
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

const KEY_PROVIDER_METADATA: Record<KeyProvider, KeyProviderMetadata> = {
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

const QUICK_ACTIONS: Record<Mode, string[]> = {
  general: ["Help me make a decision", "Explain a complex topic", "Give advice on a situation", "Guide me step by step"],
  productivity: ["Plan my day effectively", "Break down a project", "Prioritize my tasks", "Time management tips"],
  wellness: ["Morning routine ideas", "Stress management techniques", "Healthy habit suggestions", "Workout planning"],
  learning: ["Explain a concept", "Create a study plan", "Recommend resources", "Give practice exercises"],
  creative: ["Brainstorm new ideas", "Generate creative prompts", "Outline a project", "Help me overcome a block"],
  bff: ["What's the tea?", "I need motivation", "Help me with drama", "Let's chat about life"],
}

type MessagesByMode = Record<Mode, any[]>

type ApiKeyMap = {
  openai: string
  claude: string
  huggingface: string
}

const IMAGE_SETTINGS_STORAGE_KEY = "radhika-image-settings"
const LEGACY_IMAGE_PROVIDER_KEYS_STORAGE_KEY = "radhika-image-provider-keys"

const createDefaultImageSettings = (providerId: ImageProviderId = DEFAULT_IMAGE_PROVIDER): ImageSettings => {
  const providerMeta = IMAGE_PROVIDERS[providerId]
  const firstSize = providerMeta.sizes[0]

  return {
    provider: providerMeta.id,
    model: providerMeta.defaultModel ?? providerMeta.models?.[0]?.id,
    size: firstSize ? firstSize.id : "custom",
    customWidth: firstSize?.width ?? 1024,
    customHeight: firstSize?.height ?? 1024,
    style: "none",
    customStyle: "",
    customPrompt: "",
  }
}

const sanitizeImageSettings = (raw: Partial<ImageSettings> | null | undefined): ImageSettings => {
  const providerId: ImageProviderId = raw?.provider && raw.provider in IMAGE_PROVIDERS
    ? (raw.provider as ImageProviderId)
    : DEFAULT_IMAGE_PROVIDER

  const providerMeta = IMAGE_PROVIDERS[providerId]
  const base = createDefaultImageSettings(providerId)

  let size = base.size
  if (raw?.size === "custom") {
    size = "custom"
  } else if (raw?.size && providerMeta.sizes.some((option) => option.id === raw.size)) {
    size = raw.size
  }

  let customWidth = base.customWidth
  let customHeight = base.customHeight
  if (size === "custom") {
    if (typeof raw?.customWidth === "number" && Number.isFinite(raw.customWidth)) {
      customWidth = raw.customWidth
    }
    if (typeof raw?.customHeight === "number" && Number.isFinite(raw.customHeight)) {
      customHeight = raw.customHeight
    }
  } else {
    const preset = providerMeta.sizes.find((option) => option.id === size)
    if (preset) {
      customWidth = preset.width
      customHeight = preset.height
    }
  }

  let model = base.model
  if (raw?.model && providerMeta.models?.some((option) => option.id === raw.model)) {
    model = raw.model
  }

  return {
    provider: providerId,
    model,
    size,
    customWidth,
    customHeight,
    style: raw?.style ?? base.style,
    customStyle: raw?.customStyle ?? "",
    customPrompt: raw?.customPrompt ?? "",
  }
}

export default function FuturisticRadhika() {
  const [mode, setMode] = useState<Mode>("general")
  const [provider, setProvider] = useState<Provider>("groq")
  const [darkMode, setDarkMode] = useState(false)
  const [uiStyle, setUIStyle] = useState<UIStyle>("modern")
  const [error, setError] = useState<string | null>(null)
  const [navigationOpen, setNavigationOpen] = useState(false)
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false)
  const [isApiKeyDialogOpen, setIsApiKeyDialogOpen] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState<KeyProvider>("groq")
  const [tempApiKey, setTempApiKey] = useState("")

  const [imageGenerationEnabled, setImageGenerationEnabled] = useState(false)
  const [isImageSettingsDialogOpen, setIsImageSettingsDialogOpen] = useState(false)
  const [imageSettings, setImageSettings] = useState<ImageSettings>(() => createDefaultImageSettings())
  const [isGeneratingImage, setIsGeneratingImage] = useState(false)
  const [isChatLoading, setIsChatLoading] = useState(false)

  const [apiKeys, setApiKeys] = useState<ApiKeyMap>(() => ({
    openai: "",
    claude: "",
    huggingface: "",
  }))

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesByModeRef = useRef<MessagesByMode>({
    general: [],
    productivity: [],
    wellness: [],
    learning: [],
    creative: [],
    bff: [],
  })
  const currentModeRef = useRef<Mode>(mode)
  currentModeRef.current = mode

  const {
    isListening,
    isSpeaking,
    voiceEnabled,
    setVoiceEnabled,
    speakMessage,
    stopSpeaking,
    startListening,
    error: speechError,
    clearError: clearSpeechError,
  } = useSpeech()

  const currentApiKey = useMemo(() => {
    if (!PROVIDERS[provider].requiresApiKey) return ""
    if (provider === "openai") return apiKeys.openai
    if (provider === "claude") return apiKeys.claude
    return ""
  }, [provider, apiKeys])

  const chatConfig = useMemo(
    () => ({
      api: "/api/chat",
      body: {
        mode,
        provider,
        ...(currentApiKey ? { apiKey: currentApiKey } : {}),
      },
      onError: (incomingError: Error) => {
        console.error("Chat error details:", incomingError)
        const message = incomingError.message || "Failed to send message. Please try again."
        setError(
          message.includes("API") || message.includes("key")
            ? `${message} Please configure your ${PROVIDERS[provider].name} API key.`
            : message,
        )
      },
      onFinish: (message: any) => {
        setError(null)
        if (voiceEnabled && message?.content) {
          speakMessage(message.content)
        }
      },
    }),
    [mode, provider, currentApiKey, voiceEnabled, speakMessage],
  )

  const chatHelpers: any = useChat(chatConfig)
  
  // Fallback state for input if useChat doesn't provide it
  const [localInput, setLocalInput] = useState("")
  
  // Extract core values from chatHelpers
  const messages = chatHelpers.messages ?? []
  const setMessages = chatHelpers.setMessages ?? (() => {})
  const isLoading = chatHelpers.isLoading ?? isChatLoading
  const input = chatHelpers.input !== undefined ? chatHelpers.input : localInput
  const append = chatHelpers.append ?? null
  const reload = chatHelpers.reload ?? null
  
  // Store the original handlers in refs to avoid dependency issues
  const handleInputChangeRef = useRef(chatHelpers.handleInputChange)
  const setInputRef = useRef(chatHelpers.setInput)
  const handleSubmitRef = useRef(chatHelpers.handleSubmit)
  const appendRef = useRef(append)
  
  // Update refs when chatHelpers changes
  useEffect(() => {
    handleInputChangeRef.current = chatHelpers.handleInputChange
    setInputRef.current = chatHelpers.setInput
    handleSubmitRef.current = chatHelpers.handleSubmit
    appendRef.current = chatHelpers.append
  }, [chatHelpers])
  
  // Ensure handleInputChange always works
  const handleInputChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    if (handleInputChangeRef.current) {
      handleInputChangeRef.current(e)
    } else if (setInputRef.current) {
      setInputRef.current(value)
    } else {
      setLocalInput(value)
    }
  }, [])
  
  // Ensure setInput always works
  const setInput = useCallback((value: string) => {
    if (setInputRef.current) {
      setInputRef.current(value)
    } else {
      setLocalInput(value)
    }
  }, [])
  
  // Ensure handleSubmit always works - this is critical for messages to be sent
  const handleSubmit = useCallback((e: FormEvent<HTMLFormElement>) => {
    if (handleSubmitRef.current) {
      handleSubmitRef.current(e)
    } else {
      e.preventDefault()
    }
  }, [])

  useEffect(() => {
    messagesByModeRef.current[currentModeRef.current] = [...messages]
  }, [messages])

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark")
    } else {
      document.documentElement.classList.remove("dark")
    }
  }, [darkMode])

  useEffect(() => {
    if (typeof window === "undefined") return

    const nextKeys: ApiKeyMap = {
      openai: "",
      claude: "",
      huggingface: "",
    }

    try {
      const savedApiKeys = localStorage.getItem("radhika-api-keys")
      if (savedApiKeys) {
        const parsed = JSON.parse(savedApiKeys) as Partial<ApiKeyMap>
        if (parsed && typeof parsed === "object") {
          if (typeof parsed.openai === "string") {
            nextKeys.openai = parsed.openai
          }
          if (typeof parsed.claude === "string") {
            nextKeys.claude = parsed.claude
          }
          if (typeof parsed.huggingface === "string") {
            nextKeys.huggingface = parsed.huggingface
          }
        }
      }
    } catch (parseError) {
      console.error("Failed to parse saved API keys", parseError)
    }

    try {
      if (!nextKeys.huggingface) {
        const legacyKeys = localStorage.getItem(LEGACY_IMAGE_PROVIDER_KEYS_STORAGE_KEY)
        if (legacyKeys) {
          const parsedLegacy = JSON.parse(legacyKeys) as Record<string, unknown>
          const legacyHuggingface = parsedLegacy?.huggingface
          if (typeof legacyHuggingface === "string" && legacyHuggingface.trim()) {
            nextKeys.huggingface = legacyHuggingface.trim()
          }
        }
      }
    } catch (parseError) {
      console.error("Failed to parse legacy image provider keys", parseError)
    }

    setApiKeys(nextKeys)
    localStorage.setItem("radhika-api-keys", JSON.stringify(nextKeys))
    localStorage.removeItem(LEGACY_IMAGE_PROVIDER_KEYS_STORAGE_KEY)
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return

    const savedSettings = localStorage.getItem(IMAGE_SETTINGS_STORAGE_KEY)
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings) as { enabled?: boolean; settings?: Partial<ImageSettings> }
        if (typeof parsed.enabled === "boolean") {
          setImageGenerationEnabled(parsed.enabled)
        }
        if (parsed.settings) {
          setImageSettings(sanitizeImageSettings(parsed.settings))
        }
      } catch (parseError) {
        console.error("Failed to parse saved image settings", parseError)
      }
    }

  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    localStorage.setItem(
      IMAGE_SETTINGS_STORAGE_KEY,
      JSON.stringify({ enabled: imageGenerationEnabled, settings: imageSettings }),
    )
  }, [imageGenerationEnabled, imageSettings])
  const combinedError = error || speechError

  useEffect(() => {
    // Use requestAnimationFrame to prevent infinite loops during streaming
    const timeoutId = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, 100)
    
    return () => clearTimeout(timeoutId)
  }, [messages.length])

  const handleQuickAction = useCallback(
    (action: string) => {
      setInput(action)
      setError(null)
      clearSpeechError()
    },
    [setInput, clearSpeechError],
  )

  const clearChat = useCallback(() => {
    setMessages([])
    messagesByModeRef.current[currentModeRef.current] = []
    setError(null)
    clearSpeechError()
    stopSpeaking()
  }, [setMessages, clearSpeechError, stopSpeaking])

  const handleVoiceInput = useCallback(() => {
    startListening((transcript: string) => {
      setInput(transcript)
    })
  }, [startListening, setInput])

  const handleModeChange = useCallback(
    (nextMode: Mode) => {
      if (nextMode === mode) return
      messagesByModeRef.current[currentModeRef.current] = [...messages]
      setMode(nextMode)
      setError(null)
      clearSpeechError()
      setNavigationOpen(false)
      const nextMessages = messagesByModeRef.current[nextMode] || []
      setMessages(nextMessages)
    },
    [mode, messages, setMessages, clearSpeechError],
  )

  const handleProviderChange = useCallback(
    (nextProvider: Provider) => {
      if (PROVIDERS[nextProvider].requiresApiKey) {
        const hasKey =
          nextProvider === "openai"
            ? Boolean(apiKeys.openai)
            : nextProvider === "claude"
              ? Boolean(apiKeys.claude)
              : true

        if (!hasKey) {
          setSelectedProvider(nextProvider)
          setTempApiKey("")
          setIsApiKeyDialogOpen(true)
          return
        }
      }

      setProvider(nextProvider)
      setError(null)
      clearSpeechError()
    },
    [apiKeys, clearSpeechError],
  )

  const handleSaveApiKey = useCallback(() => {
    if (!tempApiKey.trim()) {
      setIsApiKeyDialogOpen(false)
      return
    }

    if (selectedProvider !== "openai" && selectedProvider !== "claude" && selectedProvider !== "huggingface") {
      setIsApiKeyDialogOpen(false)
      return
    }

    const updatedKeys: ApiKeyMap = {
      ...apiKeys,
      [selectedProvider]: tempApiKey.trim(),
    }

    setApiKeys(updatedKeys)
    localStorage.setItem("radhika-api-keys", JSON.stringify(updatedKeys))

    if (selectedProvider === "openai" || selectedProvider === "claude") {
      setProvider(selectedProvider)
    }
    setError(null)
    clearSpeechError()
    setIsApiKeyDialogOpen(false)
    setTempApiKey("")
  }, [apiKeys, selectedProvider, tempApiKey, clearSpeechError])

  const handleRemoveApiKey = useCallback(() => {
    if (selectedProvider !== "openai" && selectedProvider !== "claude" && selectedProvider !== "huggingface") {
      setIsApiKeyDialogOpen(false)
      return
    }

    const updatedKeys: ApiKeyMap = {
      ...apiKeys,
      [selectedProvider]: "",
    }

    setApiKeys(updatedKeys)
    localStorage.setItem("radhika-api-keys", JSON.stringify(updatedKeys))

    // Switch back to groq if removing the current provider's key
    if (selectedProvider === provider) {
      setProvider("groq")
    }

    setError(null)
    clearSpeechError()
    setIsApiKeyDialogOpen(false)
    setTempApiKey("")
  }, [apiKeys, selectedProvider, provider, clearSpeechError])

  const handleApiDialogChange = useCallback((open: boolean) => {
    setIsApiKeyDialogOpen(open)
    if (!open) {
      setTempApiKey("")
    }
  }, [])

  const handleOpenSettings = useCallback(() => {
    setIsSettingsDialogOpen(true)
  }, [])

  const handleManageProvider = useCallback((providerKey: KeyProvider) => {
    setSelectedProvider(providerKey)
    setTempApiKey("")
    setIsApiKeyDialogOpen(true)
  }, [])

  const promptForProviderKey = useCallback(
    (providerId: ImageProviderId) => {
      if (providerId === "openai") {
        setSelectedProvider("openai")
        setTempApiKey("")
        setIsApiKeyDialogOpen(true)
        return
      }

      if (providerId === "huggingface") {
        setSelectedProvider("huggingface")
        setTempApiKey("")
        setIsApiKeyDialogOpen(true)
      }
    },
    [],
  )

  const ensureProviderKey = useCallback(
    (providerId: ImageProviderId) => {
      if (providerId === "pollinations_free" || providerId === "free_alternatives") { //|| providerId === "gemini"
        return true
      }

      if (providerId === "openai") {
        return Boolean(apiKeys.openai)
      }

      if (providerId === "huggingface") {
        return Boolean(apiKeys.huggingface)
      }

      return true
    },
    [apiKeys.openai, apiKeys.huggingface],
  )

  const handleToggleImageGeneration = useCallback(
    (enabled: boolean) => {
      if (enabled) {
        if (!ensureProviderKey(imageSettings.provider)) {
          promptForProviderKey(imageSettings.provider)
          return
        }
      }

      setImageGenerationEnabled(enabled)
    },
    [ensureProviderKey, imageSettings.provider, promptForProviderKey],
  )

  const handleOpenImageGenerationSettings = useCallback(() => {
    if (!ensureProviderKey(imageSettings.provider)) {
      promptForProviderKey(imageSettings.provider)
      return
    }

    setIsImageSettingsDialogOpen(true)
  }, [ensureProviderKey, imageSettings.provider, promptForProviderKey])

  const handleImageSettingsSave = useCallback((updatedSettings: ImageSettings) => {
    setImageSettings({
      ...updatedSettings,
      customPrompt: updatedSettings.customPrompt.trim(),
      customStyle: updatedSettings.customStyle?.trim() ?? "",
    })
    setIsImageSettingsDialogOpen(false)
  }, [])

  const handleComposerSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      
      const promptText = input.trim()
      if (!promptText) {
        return
      }

      // Prevent duplicate submissions
      if (isChatLoading || isGeneratingImage) {
        console.log('Already processing, skipping duplicate submission')
        return
      }

      // Auto-detect image generation keywords and patterns
      const lowerPrompt = promptText.toLowerCase()
      
      // Direct action keywords
      const actionKeywords = [
        'generate image',
        'create image',
        'make image',
        'draw',
        'generate picture',
        'create picture',
        'make picture',
        'generate photo',
        'create photo',
        'make photo',
        'show me image',
        'show me picture',
        'show me photo',
        'visualize',
        'illustrate',
        'design image',
        'produce image',
        'render image',
        'paint',
        'sketch'
      ]
      
      // Descriptive patterns that indicate image generation intent
      const descriptivePatterns = [
        /image of (a|an|the|it|that|this)/i,
        /picture of (a|an|the|it|that|this)/i,
        /photo of (a|an|the|it|that|this)/i,
        /\[image:/i,  // Markdown-style image descriptions
        /(draw|paint|create|generate|make|show|visualize).*(image|picture|photo|art)/i,
        // Contextual references - when user refers to something previously discussed
        /(generate|create|make|show|draw|paint).+(it|that|this)/i,
        /(image|picture|photo).+(it|that|this)/i,
      ]
      
      const hasActionKeyword = actionKeywords.some(keyword => lowerPrompt.includes(keyword))
      const hasDescriptivePattern = descriptivePatterns.some(pattern => pattern.test(promptText))
      
      const shouldAutoGenerateImage = hasActionKeyword || hasDescriptivePattern

      // Create user message
      const userMessage = {
        id: `user-${Date.now()}`,
        role: 'user' as const,
        content: promptText,
      }

      // Clear the input first
      setInput("")

      // Add user message to chat
      setMessages((prev: any) => [...prev, userMessage])

      // Determine if we should generate an image
      const willGenerateImage = imageGenerationEnabled || shouldAutoGenerateImage

      // If image generation is enabled or auto-detected, skip chatbot response
      if (willGenerateImage) {
        // Continue to image generation below
      } else {
        // Send to API and get chatbot response
        // Pass the userMessage so the function knows about it
        sendChatMessage(userMessage)
      }

      if (!willGenerateImage) {
        return
      }

      // Continue with image generation flow

      const providerMeta = IMAGE_PROVIDERS[imageSettings.provider]
      const placeholderId = `image-${Date.now()}-${Math.random().toString(16).slice(2)}`
      const providerKey = imageSettings.provider === "openai"
        ? apiKeys.openai
        : imageSettings.provider === "huggingface"
          ? apiKeys.huggingface
          : ""

      setIsGeneratingImage(true)
      setMessages((prev: any) => [
        ...prev,
        {
          id: placeholderId,
          role: "assistant",
          content: "_Generating image..._",
        } as any,
      ])

      if (providerMeta.requiresKey && !providerKey) {
        if (imageSettings.provider === "openai" || imageSettings.provider === "huggingface") {
          promptForProviderKey(imageSettings.provider)
        }
        setMessages((prev: any) =>
          prev.map((message: any) =>
            message.id === placeholderId
              ? {
                  ...message,
                  content: `Image generation requires an API key for ${providerMeta.name}. Update Image Settings to continue.`,
                }
              : message,
          ),
        )
        setIsGeneratingImage(false)
        return
      }

      const chosenModel =
        imageSettings.model || providerMeta.defaultModel || providerMeta.models?.[0]?.id

      const promptTemplate = imageSettings.customPrompt.trim()
      let promptPayload = promptText
      if (promptTemplate) {
        promptPayload = promptTemplate.includes("{input}")
          ? promptTemplate.split("{input}").join(promptText)
          : `${promptTemplate}. ${promptText}`
      }

      const customStyle = (imageSettings.customStyle ?? "").trim()

      const requestBody: Record<string, unknown> = {
        provider: imageSettings.provider,
        prompt: promptPayload,
        content: promptText,
        title: MODES[mode].label,
        size: imageSettings.size,
        model: chosenModel,
        style: imageSettings.style,
      }

      if (imageSettings.size === "custom") {
        requestBody.customWidth = imageSettings.customWidth
        requestBody.customHeight = imageSettings.customHeight
      }

      if (imageSettings.style === "custom" && customStyle) {
        requestBody.customStyle = customStyle
      }

      if (providerKey) {
        requestBody.apiKey = providerKey
      }

      try {
        const response = await fetch("/api/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        })

        const data = await response.json().catch(() => ({}))

        if (!response.ok || !data?.success) {
          throw new Error(data?.error || "Image generation failed")
        }

        const markdown = `![Generated image](${data.imageUrl})\n\n*${data.provider} · ${data.model} · ${data.size}*\n\n**Prompt:** ${data.prompt}`

        setMessages((prev: any) =>
          prev.map((message: any) => (message.id === placeholderId ? { ...message, content: markdown } : message)),
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : "Image generation failed"
        setMessages((prev: any) =>
          prev.map((entry: any) =>
            entry.id === placeholderId
              ? { ...entry, content: `Image generation failed: ${message}` }
              : entry,
          ),
        )
      } finally {
        setIsGeneratingImage(false)
      }
    },
    [
      apiKeys.openai,
      apiKeys.huggingface,
      imageGenerationEnabled,
      imageSettings,
      input,
      mode,
      setInput,
      setMessages,
      messages,
      provider,
      currentApiKey,
      isChatLoading,
      isGeneratingImage,
    ],
  )

  // Helper function to send chat message and handle streaming
  const sendChatMessage = useCallback(async (userMessage: any) => {
    // Prevent duplicate submissions
    if (isChatLoading) {
      console.log('Already loading, skipping duplicate request')
      return
    }
    
    setIsChatLoading(true)
    
    // Get current messages including the new user message
    let currentMessages: any[] = []
    setMessages((prev: any) => {
      currentMessages = [...prev]
      return prev
    })
    
    // Ensure the user message is in the conversation
    if (currentMessages.length === 0 || currentMessages[currentMessages.length - 1].id !== userMessage.id) {
      currentMessages = [...currentMessages, userMessage]
    }
    
    console.log('Sending messages to API:', {
      count: currentMessages.length,
      roles: currentMessages.map((m: any) => m.role),
      lastMessage: currentMessages[currentMessages.length - 1]?.content?.substring(0, 50)
    })
    
    const assistantMessageId = `assistant-${Date.now()}`
    let accumulatedContent = ''
    
    try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: currentMessages,
            mode,
            provider,
            ...(currentApiKey ? { apiKey: currentApiKey } : {}),
          }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || `Failed to get response: ${response.status}`)
        }

        // Read the streaming response - AI SDK uses text/plain streaming
        const reader = response.body?.getReader()
        const decoder = new TextDecoder()
        
        if (!reader) {
          throw new Error('No response stream available')
        }
        
        // Add empty assistant message placeholder
        setMessages((prev: any) => [...prev, {
          id: assistantMessageId,
          role: 'assistant' as const,
          content: '',
        }])

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) {
              console.log('✅ Stream complete, total content length:', accumulatedContent.length)
              break
            }
            
            const chunk = decoder.decode(value, { stream: true })
            
            // AI SDK toTextStreamResponse() returns plain text chunks
            if (chunk) {
              accumulatedContent += chunk
              setMessages((prev: any) => 
                prev.map((msg: any) => 
                  msg.id === assistantMessageId ? { ...msg, content: accumulatedContent } : msg
                )
              )
            }
          }
        } catch (streamError) {
          console.error('❌ Stream error:', streamError)
          // Remove empty assistant message on stream error
          setMessages((prev: any) => prev.filter((msg: any) => msg.id !== assistantMessageId))
          throw streamError
        }
        
        // If no content was received, remove the empty message
        if (!accumulatedContent || accumulatedContent.trim() === '') {
          console.error('❌ No content received from stream')
          setMessages((prev: any) => prev.filter((msg: any) => msg.id !== assistantMessageId))
          throw new Error('No response received from AI')
        }
        
        console.log('✅ Chat message completed successfully')
    } catch (error) {
      console.error('❌ Chat error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      // Add error message only if we don't already have an empty assistant message
      setMessages((prev: any) => {
        const hasEmptyAssistant = prev.some((msg: any) => msg.id === assistantMessageId && !msg.content)
        if (hasEmptyAssistant) {
          // Remove the empty assistant message
          return prev.filter((msg: any) => msg.id !== assistantMessageId)
        }
        return [
          ...prev,
          {
            id: `error-${Date.now()}`,
            role: 'assistant' as const,
            content: `Sorry, I encountered an error. Please try again.`,
          },
        ]
      })
    } finally {
      setIsChatLoading(false)
    }
  }, [mode, provider, currentApiKey, setMessages])

  const currentMode = useMemo(() => MODES[mode], [mode])
  const providerLabel = useMemo(() => PROVIDERS[provider].name, [provider])
  const imageSettingsLabel = useMemo(() => {
    const providerMeta = IMAGE_PROVIDERS[imageSettings.provider]
    const desiredModel = imageSettings.model || providerMeta.defaultModel
    const modelLabel = providerMeta.models?.find((modelOption) => modelOption.id === desiredModel)?.label
    return modelLabel ? `${providerMeta.name} · ${modelLabel}` : providerMeta.name
  }, [imageSettings])

  const formatTime = useCallback((timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }, [])

  const handleImageRetry = useCallback((messageId: string) => {
    console.log("Retrying image generation for message:", messageId)
    
    // Find the message to retry
    setMessages((prev: any) => {
      const messageIndex = prev.findIndex((msg: any) => msg.id === messageId)
      if (messageIndex === -1) return prev
      
      const message = prev[messageIndex]
      
      // Extract the prompt from the message content
      const promptMatch = message.content.match(/\*\*Prompt:\*\*\s*(.+)$/)
      const prompt = promptMatch ? promptMatch[1].trim() : ""
      
      if (!prompt) {
        console.error("Could not extract prompt from message")
        return prev
      }
      
      // Update the message to show "Regenerating..."
      const updatedMessages = [...prev]
      updatedMessages[messageIndex] = {
        ...message,
        content: "_Regenerating image..._",
      }
      
      // Trigger image generation with the same prompt
      setTimeout(() => {
        void (async () => {
          setIsGeneratingImage(true)
          
          const providerMeta = IMAGE_PROVIDERS[imageSettings.provider]
          const providerKey = imageSettings.provider === "openai"
            ? apiKeys.openai
            : imageSettings.provider === "huggingface"
              ? apiKeys.huggingface
              : ""
          
          const chosenModel = imageSettings.model || providerMeta.defaultModel || providerMeta.models?.[0]?.id
          const customStyle = (imageSettings.customStyle ?? "").trim()
          
          const requestBody: Record<string, unknown> = {
            provider: imageSettings.provider,
            prompt: prompt,
            content: prompt,
            title: MODES[mode].label,
            size: imageSettings.size,
            model: chosenModel,
            style: imageSettings.style,
          }
          
          if (imageSettings.size === "custom") {
            requestBody.customWidth = imageSettings.customWidth
            requestBody.customHeight = imageSettings.customHeight
          }
          
          if (imageSettings.style === "custom" && customStyle) {
            requestBody.customStyle = customStyle
          }
          
          if (providerKey) {
            requestBody.apiKey = providerKey
          }
          
          try {
            const response = await fetch("/api/image", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(requestBody),
            })
            
            const data = await response.json().catch(() => ({}))
            
            if (!response.ok || !data?.success) {
              throw new Error(data?.error || "Image generation failed")
            }
            
            const markdown = `![Generated image](${data.imageUrl})\n\n*${data.provider} · ${data.model} · ${data.size}*\n\n**Prompt:** ${data.prompt}`
            
            setMessages((current: any) =>
              current.map((msg: any) => (msg.id === messageId ? { ...msg, content: markdown } : msg))
            )
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Image generation failed"
            setMessages((current: any) =>
              current.map((msg: any) =>
                msg.id === messageId
                  ? { ...msg, content: `Image generation failed: ${errorMessage}` }
                  : msg
              )
            )
          } finally {
            setIsGeneratingImage(false)
          }
        })()
      }, 100)
      
      return updatedMessages
    })
  }, [apiKeys.openai, apiKeys.huggingface, imageSettings, mode, setMessages])

  const MarkdownComponents: Components = useMemo(
    () => ({
      h1: ({ children }) => (
        <h1
          className={`mb-2 text-base font-semibold text-slate-900 dark:text-slate-100 lg:text-lg ${uiStyle === "pixel" ? "pixel-font text-sm" : ""}`}
        >
          {children}
        </h1>
      ),
      h2: ({ children }) => (
        <h2
          className={`mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100 lg:text-base ${uiStyle === "pixel" ? "pixel-font text-xs" : ""}`}
        >
          {children}
        </h2>
      ),
      h3: ({ children }) => (
        <h3
          className={`mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100 ${uiStyle === "pixel" ? "pixel-font text-xs" : ""}`}
        >
          {children}
        </h3>
      ),
      p: ({ children }) => (
        <p
          className={`mb-2 text-sm leading-relaxed text-slate-700 dark:text-slate-300 ${uiStyle === "pixel" ? "pixel-font text-xs" : ""}`}
        >
          {children}
        </p>
      ),
      ul: ({ children }) => (
        <ul className={`ml-4 mb-2 list-disc space-y-1 text-sm text-slate-700 dark:text-slate-300 ${uiStyle === "pixel" ? "ml-0 list-none pixel-font text-xs" : ""}`}>{children}</ul>
      ),
      ol: ({ children }) => (
        <ol className={`ml-4 mb-2 list-decimal space-y-1 text-sm text-slate-700 dark:text-slate-300 ${uiStyle === "pixel" ? "ml-0 list-none pixel-font text-xs" : ""}`}>{children}</ol>
      ),
      li: ({ children }) => (
        <li className={`text-sm text-slate-700 dark:text-slate-300 ${uiStyle === "pixel" ? 'pixel-font text-xs before:content-["▶_"] before:text-cyan-600 dark:before:text-cyan-400' : ''}`}>{children}</li>
      ),
      strong: ({ children }) => (
        <strong className={`text-slate-900 dark:text-slate-100 ${uiStyle === "pixel" ? "pixel-font" : "font-semibold"}`}>{children}</strong>
      ),
      em: ({ children }) => (
        <em className={`italic text-slate-700 dark:text-slate-300 ${uiStyle === "pixel" ? "pixel-font" : ""}`}>{children}</em>
      ),
      code: ({ children, className }) => {
        const isInline = !className?.includes("language-")
        return (
          <CodeBlock 
            isInline={isInline}
            className={className}
            isPixel={uiStyle === "pixel"}
          >
            {String(children).replace(/\n$/, "")}
          </CodeBlock>
        )
      },
      pre: ({ children }) => <>{children}</>,
      blockquote: ({ children }) => (
        <blockquote className={`border-l-4 border-cyan-500/70 pl-4 text-sm italic text-slate-600 dark:text-slate-400 ${uiStyle === "pixel" ? "pixel-font" : ""}`}>{children}</blockquote>
      ),
      a: ({ href, children }) => (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={`text-cyan-600 underline transition hover:text-cyan-500 dark:text-cyan-400 ${uiStyle === "pixel" ? "pixel-font" : ""}`}
        >
          {children}
        </a>
      ),
    }),
    [uiStyle],
  )

  const modeCounts: Record<Mode, number> = {
    general: messagesByModeRef.current.general.length,
    productivity: messagesByModeRef.current.productivity.length,
    wellness: messagesByModeRef.current.wellness.length,
    learning: messagesByModeRef.current.learning.length,
    creative: messagesByModeRef.current.creative.length,
    bff: messagesByModeRef.current.bff.length,
  }

  const providerApiKeySet = {
    groq: true,
    gemini: true,
    openai: Boolean(apiKeys.openai),
    claude: Boolean(apiKeys.claude),
  }

  return (
    <>
      <SidebarDrawer open={navigationOpen} onOpenChange={setNavigationOpen} isPixel={uiStyle === "pixel"}>
        <SidebarNav
          mode={mode}
          modes={MODES}
          quickActions={QUICK_ACTIONS[mode]}
          onModeChange={handleModeChange}
          onQuickAction={handleQuickAction}
          modeCounts={modeCounts}
          uiStyle={uiStyle}
          onDismiss={() => setNavigationOpen(false)}
          onOpenSettings={handleOpenSettings}
          showCloseButton
          showQuickActions={false}
        />
      </SidebarDrawer>

      <ChatAppShell
        isPixel={uiStyle === "pixel"}
        sidebar={
          <SidebarNav
            mode={mode}
            modes={MODES}
            quickActions={QUICK_ACTIONS[mode]}
            onModeChange={handleModeChange}
            onQuickAction={handleQuickAction}
            modeCounts={modeCounts}
            uiStyle={uiStyle}
            onOpenSettings={handleOpenSettings}
          />
        }
        topbar={
          <ChatTopbar
            mode={mode}
            modeMeta={currentMode}
            uiStyle={uiStyle}
            onToggleUI={() => setUIStyle(uiStyle === "modern" ? "pixel" : "modern")}
            darkMode={darkMode}
            onToggleTheme={() => setDarkMode((prev) => !prev)}
            messageCount={messages.length}
            voiceEnabled={voiceEnabled}
            onToggleVoice={() => setVoiceEnabled(!voiceEnabled)}
            onClearChat={clearChat}
            onOpenSidebar={() => setNavigationOpen(true)}
            providerLabel={providerLabel}
            error={combinedError ?? null}
            onDismissError={() => {
              setError(null)
              clearSpeechError()
            }}
          />
        }
        insights={
          <InsightsPanel uiStyle={uiStyle}>
            <ActivityMatrix messages={messages} currentMode={mode} uiStyle={uiStyle} />
          </InsightsPanel>
        }
      >
        <ChatFeed
          messages={messages as any}
          currentMode={currentMode}
          uiStyle={uiStyle}
          MarkdownComponents={MarkdownComponents}
          formatTime={formatTime}
          isLoading={isLoading}
          isListening={isListening}
          messagesEndRef={messagesEndRef}
          quickActions={QUICK_ACTIONS[mode]}
          onQuickAction={handleQuickAction}
          mode={mode}
          onImageRetry={handleImageRetry}
        />
        <ChatComposer
          input={input}
          onInputChange={handleInputChange}
          onSubmit={handleComposerSubmit}
          placeholder={currentMode.placeholder}
          isLoading={isLoading}
          isListening={isListening}
          isSpeaking={isSpeaking}
          onVoiceInput={handleVoiceInput}
          onStopSpeaking={stopSpeaking}
          provider={provider}
          providers={PROVIDERS}
          onProviderChange={handleProviderChange}
          uiStyle={uiStyle}
          providerApiKeySet={providerApiKeySet}
          imageGenerationEnabled={imageGenerationEnabled}
          onToggleImageGeneration={handleToggleImageGeneration}
          onOpenImageSettings={handleOpenImageGenerationSettings}
          imageSettingsLabel={imageSettingsLabel}
          isGeneratingImage={isGeneratingImage}
        />
      </ChatAppShell>

      <ImageSettingsDialog
        open={isImageSettingsDialogOpen}
        onOpenChange={setIsImageSettingsDialogOpen}
        settings={imageSettings}
        onSave={handleImageSettingsSave}
        uiStyle={uiStyle}
        providerKeyStatus={
          {
            pollinations_free: true,
            free_alternatives: true,
            openai: Boolean(apiKeys.openai),
            huggingface: Boolean(apiKeys.huggingface),
            // gemini: true,
          } satisfies Record<ImageProviderId, boolean>
        }
        onRequestProviderKey={promptForProviderKey}
      />

      <SettingsDialog
        open={isSettingsDialogOpen}
        onOpenChange={setIsSettingsDialogOpen}
        apiKeys={apiKeys}
        providers={PROVIDERS}
        onManageProvider={handleManageProvider}
        uiStyle={uiStyle}
      />

      <ApiKeyDialog
        open={isApiKeyDialogOpen}
        onOpenChange={handleApiDialogChange}
        provider={selectedProvider}
        providerMeta={KEY_PROVIDER_METADATA[selectedProvider]}
        tempApiKey={tempApiKey}
        onTempApiKeyChange={(event) => setTempApiKey(event.target.value)}
        onSave={handleSaveApiKey}
        onRemove={handleRemoveApiKey}
        hasExistingKey={
          selectedProvider === "openai"
            ? Boolean(apiKeys.openai)
            : selectedProvider === "claude"
              ? Boolean(apiKeys.claude)
              : selectedProvider === "huggingface"
                ? Boolean(apiKeys.huggingface)
                : false
        }
        uiStyle={uiStyle}
      />

      <Analytics />
      <SpeedInsights />
    </>
  )
}
