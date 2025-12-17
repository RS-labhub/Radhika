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
import { ChatHistorySidebar } from "@/components/chat/chat-history-sidebar"
import { InsightsPanel } from "@/components/chat/insights-panel"
import { ActivityMatrix } from "@/components/activity-matrix"
import { Button } from "@/components/ui/button"
import { ApiKeyDialog } from "@/components/dialog/api-key-dialog"
import { ImageSettingsDialog } from "@/components/dialog/image-settings-dialog"
import { CodeBlock } from "@/components/chat/code-block"
import { useChatPersistence } from "@/hooks/use-chat-persistence"
import { GeneratedImage } from "@/components/chat/generated-image"
import { useSpeech } from "@/hooks/use-speech"
import { UserMenu } from "@/components/auth/user-menu"
import { useFeatureAccess } from "@/hooks/use-feature-access"
import { useTheme } from "next-themes"
import { chatService } from "@/lib/supabase/chat-service"

import type { KeyProvider, KeyProviderMetadata, Mode, ModeDefinition, Provider, ProviderDefinition, UIStyle, UserGender, UserAge, UserPersonalization, Chat } from "@/types/chat"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/ui/use-toast"
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
  groq: string
  gemini: string
  huggingface: string
}

type ProviderModelMap = Record<Provider, string>

const IMAGE_SETTINGS_STORAGE_KEY = "radhika-image-settings"
const LEGACY_IMAGE_PROVIDER_KEYS_STORAGE_KEY = "radhika-image-provider-keys"
const PERSONALIZATION_STORAGE_KEY = "radhika-personalization"

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
  const { theme, setTheme } = useTheme()
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])
  const [mode, setMode] = useState<Mode>("general")
  const [provider, setProvider] = useState<Provider>("gemini")
  const [uiStyle, setUIStyle] = useState<UIStyle>("modern")
  const [error, setError] = useState<string | null>(null)
  const [navigationOpen, setNavigationOpen] = useState(false)
  const [chatHistoryOpen, setChatHistoryOpen] = useState(false)
  const [isApiKeyDialogOpen, setIsApiKeyDialogOpen] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState<KeyProvider>("groq")
  const [tempApiKey, setTempApiKey] = useState("")

  const [imageGenerationEnabled, setImageGenerationEnabled] = useState(false)
  const [isImageSettingsDialogOpen, setIsImageSettingsDialogOpen] = useState(false)
  const [imageSettings, setImageSettings] = useState<ImageSettings>(() => createDefaultImageSettings())
  const [isGeneratingImage, setIsGeneratingImage] = useState(false)
  const isGeneratingImageRef = useRef(false)
  const [isChatLoading, setIsChatLoading] = useState(false)

  const chatAbortControllerRef = useRef<AbortController | null>(null)
  const isChatLoadingRef = useRef(false)
  const handleComposerSubmitRef = useRef<((event: FormEvent<HTMLFormElement>) => Promise<void>) | null>(null)

  const imageAbortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    isChatLoadingRef.current = isChatLoading
  }, [isChatLoading])

  // Load saved UI style (modern/pixel) from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return
    const savedStyle = localStorage.getItem("ui_style")
    if (savedStyle === "pixel" || savedStyle === "modern") {
      setUIStyle(savedStyle)
    }
  }, [])

  // User personalization settings
  const [userPersonalization, setUserPersonalization] = useState<UserPersonalization>({
    gender: "boy",
    age: "teenage",
    tone: "friendly",
  })

  const [apiKeys, setApiKeys] = useState<ApiKeyMap>(() => ({
    openai: "",
    claude: "",
    groq: "",
    gemini: "",
    huggingface: "",
  }))

  const [modelPreferences, setModelPreferences] = useState<ProviderModelMap>(() => ({
    groq: PROVIDERS.groq.models[0],
    gemini: PROVIDERS.gemini.models[0],
    openai: PROVIDERS.openai.models[0],
    claude: PROVIDERS.claude.models[0],
  }))

  const resolveModel = useCallback((providerKey: Provider) => {
    const pref = modelPreferences[providerKey]
    if (pref?.startsWith("custom:")) {
      return pref.replace("custom:", "") || modelPreferences[providerKey]
    }
    return pref
  }, [modelPreferences])

  const { isAuthenticated, canUseMode, canUsePersonalization } = useFeatureAccess()
  // Default: insights panel expanded
  const [isInsightsCollapsed, setIsInsightsCollapsed] = useState(false)

  // Chat profile state
  const [currentProfileId, setCurrentProfileId] = useState<string | null>(null)

  // Chat persistence hook for saving messages to database
  const {
    currentChat,
    isLoadingChat,
    loadMessages: loadPersistedMessages,
    addMessage: persistMessage,
    createNewChat,
    loadChat,
    getAllChats,
    clearCurrentChat,
    isEnabled: persistenceEnabled,
  } = useChatPersistence(mode, currentProfileId || undefined)

  const { toast } = useToast()

  // State for all chats in current mode
  const [allChats, setAllChats] = useState<Chat[]>([])
  const [isLoadingAllChats, setIsLoadingAllChats] = useState(false)

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
  const persistedMessageIdsRef = useRef<Set<string>>(new Set())
  const isCreatingChatRef = useRef(false)
  const currentChatRef = useRef(currentChat)
  const persistenceEnabledRef = useRef(persistenceEnabled)
  
  // Keep refs updated
  useEffect(() => {
    currentChatRef.current = currentChat
    persistenceEnabledRef.current = persistenceEnabled
  }, [currentChat, persistenceEnabled])
  
  const [voiceAllowed, setVoiceAllowed] = useState(false)

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
    currentMessageId,
  } = useSpeech()

  // Ref to always have the latest voiceEnabled value in callbacks
  const voiceEnabledRef = useRef(voiceEnabled)
  voiceEnabledRef.current = voiceEnabled

  // Respect voice preference stored from settings
  useEffect(() => {
    if (typeof window === "undefined") return
    const storedVoice = localStorage.getItem("voice_enabled")
    const allowed = storedVoice === "true"
    setVoiceAllowed(allowed)
    setVoiceEnabled(allowed)
  }, [setVoiceEnabled])

  const currentApiKey = useMemo(() => {
    const selectedKey = apiKeys[provider as keyof ApiKeyMap]
    if (selectedKey) return selectedKey
    if (PROVIDERS[provider].requiresApiKey) return ""
    return ""
  }, [provider, apiKeys])

  // Helper to normalize message content for storage
  const normalizeContentForStorage = useCallback((content: any): string => {
    if (typeof content === "string") return content
    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part === "string") return part
          if (part && typeof part === "object") {
            // Handle image content - convert to markdown
            const partObj = part as any
            if (partObj.type === "image" && partObj.image) {
              const imageUrl = typeof partObj.image === "string" ? partObj.image : partObj.image.url
              return `![${partObj.alt || "Image"}](${imageUrl})`
            }
            // Handle text content
            if (typeof partObj.text === "string") return partObj.text
            if (typeof partObj.value === "string") return partObj.value
          }
          return ""
        })
        .join("\n\n")
    }
    if (content && typeof content === "object") {
      if (typeof (content as any).text === "string") return (content as any).text
      try {
        return JSON.stringify(content)
      } catch {
        return String(content)
      }
    }
    return content == null ? "" : String(content)
  }, [])

  const chatConfig = useMemo(
    () => ({
      api: "/api/chat",
      body: {
        mode,
        provider,
        model: resolveModel(provider),
        userGender: userPersonalization.gender,
        userAge: userPersonalization.age,
        conversationTone: mode === "bff" ? undefined : userPersonalization.tone,
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
      onFinish: async (message: any) => {
        console.log("=== onFinish called ===")
        console.log("Message:", JSON.stringify(message, null, 2))
        console.log("Current chat:", currentChat?.id)
        console.log("Persistence enabled:", persistenceEnabled)
        
        setError(null)
        
        // Ensure we have a chat before persisting
        let chatToUse = currentChat
        if (!chatToUse && persistenceEnabled && createNewChat && !isCreatingChatRef.current) {
          console.log("Creating new chat for assistant message...")
          isCreatingChatRef.current = true
          try {
            const newChat = await createNewChat()
            if (newChat) {
              chatToUse = newChat
              hasLoadedRef.current = newChat.id
              persistedMessageIdsRef.current = new Set()
              console.log("New chat created:", newChat.id)
            }
          } catch (err) {
            console.error("Failed to create chat in onFinish:", err)
          } finally {
            isCreatingChatRef.current = false
          }
        }
        
        // Persist the completed assistant message to database
        if (persistenceEnabled && chatToUse && message?.id && message?.content) {
          console.log("Conditions met, attempting to persist assistant message")
          console.log("Chat ID:", chatToUse.id)
          console.log("Message ID:", message.id)
          console.log("Content length:", message.content.length)
          
          const normalizedContent = normalizeContentForStorage(message.content)
          console.log("Normalized content length:", normalizedContent.length)
          
          if (normalizedContent.trim() && !persistedMessageIdsRef.current.has(message.id)) {
            console.log("Persisting assistant message NOW...")
            try {
              // Use chatService directly to ensure we use the correct chat ID
              const savedMessage = await chatService.addMessage(
                chatToUse.id,
                message.role || "assistant",
                normalizedContent,
                message.metadata,
                message.id
              )
              persistedMessageIdsRef.current.add(message.id)
              console.log("✅ Successfully persisted assistant message:", savedMessage)
            } catch (err) {
              console.error("❌ Failed to persist assistant message:", err)
              console.error("Error details:", JSON.stringify(err, null, 2))
            }
          } else {
            console.log("Skipping assistant message persistence:", {
              isEmpty: !normalizedContent.trim(),
              alreadyPersisted: persistedMessageIdsRef.current.has(message.id)
            })
          }
        } else {
          console.log("❌ Skipping assistant message persistence - conditions not met:", {
            persistenceEnabled,
            hasCurrentChat: !!chatToUse,
            chatId: chatToUse?.id,
            hasMessageId: !!message?.id,
            messageId: message?.id,
            hasContent: !!message?.content,
            contentPreview: message?.content?.substring(0, 50)
          })
        }
        
        if (voiceEnabledRef.current && message?.content) {
          speakMessage(message.content, undefined, mode)
        }
        
        console.log("=== onFinish completed ===\n")
      },
    }),
    [mode, provider, currentApiKey, speakMessage, userPersonalization, resolveModel, persistenceEnabled, currentChat, normalizeContentForStorage, createNewChat],
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
  const handleSubmit = useCallback(async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    // If we're currently streaming, treat submit as a "stop" action
    if (isChatLoadingRef.current || isGeneratingImageRef.current) {
      console.log("⛔ Stopping streaming response...")
      if (isChatLoadingRef.current) {
        chatAbortControllerRef.current?.abort()
        chatAbortControllerRef.current = null
        setIsChatLoading(false)
      }

      if (isGeneratingImageRef.current) {
        imageAbortControllerRef.current?.abort()
        imageAbortControllerRef.current = null
        isGeneratingImageRef.current = false
        setIsGeneratingImage(false)
      }
      return
    }
    
    // Ensure we have a chat session before submitting
    if (persistenceEnabled && !currentChat && createNewChat && !isCreatingChatRef.current) {
      console.log("📝 Creating new chat session before message submission...")
      isCreatingChatRef.current = true
      try {
        const newChat = await createNewChat()
        if (newChat) {
          console.log("✅ New chat created:", newChat.id)
          // Small delay to ensure state updates
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      } catch (err) {
        console.error("❌ Failed to create chat session:", err)
      } finally {
        isCreatingChatRef.current = false
      }
    }
    
    // Always use our composer handler (it routes to either image generation or chat)
    if (handleComposerSubmitRef.current) {
      await handleComposerSubmitRef.current(e)
    } else {
      console.warn("handleComposerSubmit not ready yet")
    }
  }, [persistenceEnabled, currentChat, createNewChat])

  const stopStreaming = useCallback(() => {
    if (!isChatLoadingRef.current) return
    console.log("⛔ Stop requested by user")
    chatAbortControllerRef.current?.abort()
    chatAbortControllerRef.current = null
    setIsChatLoading(false)
  }, [])

  const stopImageGeneration = useCallback(() => {
    if (!isGeneratingImageRef.current) return
    console.log("⛔ Stopping image generation...")
    imageAbortControllerRef.current?.abort()
    imageAbortControllerRef.current = null
    isGeneratingImageRef.current = false
    setIsGeneratingImage(false)
  }, [])


  useEffect(() => {
    messagesByModeRef.current[currentModeRef.current] = [...messages]
  }, [messages])

  // Load persisted messages when authenticated and chat is available
  const hasLoadedRef = useRef<string | null>(null)
  const isRestoringRef = useRef(false)
  useEffect(() => {
    const loadPersistedChat = async () => {
      if (!persistenceEnabled || !currentChat || hasLoadedRef.current === currentChat.id || isLoadingChat) return
      
      try {
        isRestoringRef.current = true
        persistedMessageIdsRef.current = new Set()
        const savedMessages = await loadPersistedMessages()
        // Convert to the format useChat expects
        const formattedMessages = savedMessages.map((msg) => ({
          id: msg.id,
          role: msg.role as "user" | "assistant" | "system",
          content: msg.content,
          createdAt: msg.createdAt ? new Date(msg.createdAt as string) : undefined,
          isFavorite: msg.isFavorite,
        }))
        // Track restored IDs so we don't immediately attempt to re-persist them
        for (const msg of savedMessages) {
          if (msg.id) {
            persistedMessageIdsRef.current.add(msg.id)
          }
        }
        setMessages(formattedMessages)
        messagesByModeRef.current[mode] = formattedMessages
        hasLoadedRef.current = currentChat.id
        previousMessagesLengthRef.current = formattedMessages.length
        isRestoringRef.current = false
      } catch (err) {
        console.error("Failed to load persisted messages:", err)
        isRestoringRef.current = false
      }
    }
    
    loadPersistedChat()
  }, [persistenceEnabled, currentChat, isLoadingChat, loadPersistedMessages, setMessages, mode])

  // Reset load flag when mode changes
  useEffect(() => {
    hasLoadedRef.current = null
  }, [mode])

  // Persist new messages to database
  const previousMessagesLengthRef = useRef(0)
  
  useEffect(() => {
    if (!persistenceEnabled || !currentChat || messages.length === 0) return
    if (isRestoringRef.current) {
      // Skip persisting when we're just restoring from DB to avoid duplicates
      previousMessagesLengthRef.current = messages.length
      isRestoringRef.current = false
      return
    }
    
    // Only persist if we have new messages
    if (messages.length > previousMessagesLengthRef.current) {
      const newMessages = messages.slice(previousMessagesLengthRef.current)
      console.log("New messages detected:", newMessages.length, newMessages.map((m: any) => ({ id: m.id, role: m.role })))
      
      // Process messages sequentially
      ;(async () => {
        for (const msg of newMessages) {
          if (!msg?.id) continue
          const normalizedContent = normalizeContentForStorage(msg.content)
          const trimmed = normalizedContent.trim()
          
          // Skip if we've already persisted this ID
          if (persistedMessageIdsRef.current.has(msg.id)) continue
          
          // Only persist user messages here
          // Assistant messages will be persisted when streaming completes
          if (msg.role === "user" && trimmed) {
            console.log("Persisting user message:", msg.id, "to chat:", currentChat?.id)
            try {
              await chatService.addMessage(
                currentChat.id,
                msg.role,
                normalizedContent,
                msg.metadata,
                msg.id
              )
              persistedMessageIdsRef.current.add(msg.id)
              console.log("✅ User message persisted successfully")
            } catch (err) {
              console.error("❌ Failed to persist user message:", err)
            }
          } else {
            console.log("Skipping non-user message in effect:", msg.role, msg.id)
          }
        }
      })()
    }
    previousMessagesLengthRef.current = messages.length
  }, [messages, persistenceEnabled, currentChat, persistMessage, normalizeContentForStorage])

  // Persist assistant message when streaming stops (detected by isLoading change)
  const previousIsLoadingRef = useRef(false)
  useEffect(() => {
    // When loading transitions from true to false, the streaming has completed
    if (previousIsLoadingRef.current && !isLoading) {
      console.log("🎯 Stream completed, checking for assistant messages to persist")
      
      // Find the most recent assistant message that hasn't been persisted
      const assistantMessages = messages.filter((m: any) => m.role === 'assistant')
      if (assistantMessages.length > 0) {
        const lastAssistantMessage = assistantMessages[assistantMessages.length - 1]
        console.log("Last assistant message:", lastAssistantMessage.id, "Already persisted:", persistedMessageIdsRef.current.has(lastAssistantMessage.id))
        
        if (persistenceEnabled && currentChat && lastAssistantMessage.id && !persistedMessageIdsRef.current.has(lastAssistantMessage.id)) {
          const normalizedContent = normalizeContentForStorage(lastAssistantMessage.content)
          if (normalizedContent.trim()) {
            console.log("Persisting assistant message:", lastAssistantMessage.id)
            ;(async () => {
              try {
                await chatService.addMessage(
                  currentChat.id,
                  "assistant",
                  normalizedContent,
                  lastAssistantMessage.metadata,
                  lastAssistantMessage.id
                )
                persistedMessageIdsRef.current.add(lastAssistantMessage.id)
                console.log("✅ Assistant message persisted successfully after stream completion")
              } catch (err) {
                console.error("❌ Failed to persist assistant message after stream:", err)
              }
            })()
          }
        }
      } else {
        console.log("No assistant messages found after stream completion")
      }
    }
    previousIsLoadingRef.current = isLoading
  }, [isLoading, persistenceEnabled, currentChat, messages, normalizeContentForStorage])

  useEffect(() => {
    if (!canUseMode(mode)) {
      const allowed = (Object.keys(MODES) as Mode[]).filter((modeKey) => canUseMode(modeKey))
      const fallbackMode = allowed.includes("general") ? "general" : allowed[0] ?? "general"
      setMode(fallbackMode)
      setMessages(messagesByModeRef.current[fallbackMode] ?? [])
    }
  }, [mode, canUseMode, setMessages])

  useEffect(() => {
    if (!isAuthenticated && mode !== "general") {
      setMode("general")
      setMessages(messagesByModeRef.current.general ?? [])
    }
  }, [isAuthenticated, mode, setMessages])
  useEffect(() => {
    setIsInsightsCollapsed(!isAuthenticated)
  }, [isAuthenticated])

  useEffect(() => {
    if (typeof window === "undefined") return

    const nextKeys: ApiKeyMap = {
      openai: "",
      claude: "",
      groq: "",
      gemini: "",
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
          if (typeof parsed.groq === "string") {
            nextKeys.groq = parsed.groq
          }
          if (typeof parsed.gemini === "string") {
            nextKeys.gemini = parsed.gemini
          }
          if (typeof parsed.huggingface === "string") {
            nextKeys.huggingface = parsed.huggingface
          }
        }
      }
    } catch (parseError) {
      console.error("Failed to parse saved API keys", parseError)
    }

    // Fallback: read individual provider keys saved from the settings page
    try {
      if (!nextKeys.openai) nextKeys.openai = localStorage.getItem("openai_api_key") || ""
      if (!nextKeys.claude) nextKeys.claude = localStorage.getItem("claude_api_key") || ""
      if (!nextKeys.groq) nextKeys.groq = localStorage.getItem("groq_api_key") || ""
      if (!nextKeys.gemini) nextKeys.gemini = localStorage.getItem("gemini_api_key") || ""
      if (!nextKeys.huggingface) nextKeys.huggingface = localStorage.getItem("huggingface_api_key") || ""
    } catch (fallbackError) {
      console.error("Failed to read legacy API key storage", fallbackError)
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

    // Load personalization settings
    const savedPersonalization = localStorage.getItem(PERSONALIZATION_STORAGE_KEY)
    if (savedPersonalization) {
      try {
        const parsed = JSON.parse(savedPersonalization) as Partial<UserPersonalization>
        if (parsed) {
          setUserPersonalization((prev) => ({
            gender: parsed.gender && ["boy", "girl", "other"].includes(parsed.gender) ? parsed.gender : prev.gender,
            age: parsed.age && ["kid", "teenage", "mature", "senior"].includes(parsed.age) ? parsed.age : prev.age,
            tone: parsed.tone && ["professional", "casual", "friendly", "empathetic", "playful"].includes(parsed.tone)
              ? parsed.tone
              : prev.tone ?? "friendly",
          }))
        }
      } catch (parseError) {
        console.error("Failed to parse saved personalization settings", parseError)
      }
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return

    const storedModels = localStorage.getItem("radhika-provider-models")
    if (storedModels) {
      try {
        const parsed = JSON.parse(storedModels) as Partial<ProviderModelMap>
        setModelPreferences((prev) => ({
          groq: parsed.groq || prev.groq,
          gemini: parsed.gemini || prev.gemini,
          openai: parsed.openai || prev.openai,
          claude: parsed.claude || prev.claude,
        }))
      } catch (err) {
        console.error("Failed to parse stored model preferences", err)
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

  // Save personalization settings to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return
    localStorage.setItem(PERSONALIZATION_STORAGE_KEY, JSON.stringify(userPersonalization))
  }, [userPersonalization])

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

  // Refresh the list of all chats
  const refreshChats = useCallback(async () => {
    if (!persistenceEnabled || !getAllChats) return
    
    try {
      setIsLoadingAllChats(true)
      
      // Set a safety timeout to ensure loading never hangs forever
      const safetyTimeout = setTimeout(() => {
        console.warn("Chat history load taking too long, clearing loading state")
        setIsLoadingAllChats(false)
      }, 30000) // 30 seconds max
      
      const chats = await getAllChats()
      clearTimeout(safetyTimeout)
      
      setAllChats(chats)
      if (currentChat && !chats.find((c) => c.id === currentChat.id)) {
        // Current chat was deleted; detach and clear local messages
        clearCurrentChat?.()
        setMessages([])
        messagesByModeRef.current[currentModeRef.current] = []
        hasLoadedRef.current = null
        previousMessagesLengthRef.current = 0
        persistedMessageIdsRef.current = new Set()
      }
    } catch (err) {
      console.error("Failed to refresh chats:", err)
    } finally {
      // Always clear loading state, even on error
      setIsLoadingAllChats(false)
    }
  }, [persistenceEnabled, getAllChats, currentChat, clearCurrentChat, setMessages])

  // Create a chat only after the first message is present
  useEffect(() => {
    if (!persistenceEnabled || currentChat || !createNewChat) return
    if (messages.length === 0) return
    if (isRestoringRef.current) return
    if (isCreatingChatRef.current) return

    console.log("🔄 Auto-creating chat session after first message...")
    isCreatingChatRef.current = true
    ;(async () => {
      try {
        const newChat = await createNewChat()
        if (newChat) {
          hasLoadedRef.current = newChat.id
          persistedMessageIdsRef.current = new Set()
          console.log("✅ Auto-created chat session:", newChat.id)
          await refreshChats()
        }
      } catch (err) {
        console.error("❌ Failed to auto-create chat after first message:", err)
      } finally {
        isCreatingChatRef.current = false
      }
    })()
  }, [messages.length, persistenceEnabled, currentChat, createNewChat, refreshChats])

  // Create a new chat session
  const handleNewChat = useCallback(async () => {
    // Clear current messages
    setMessages([])
    messagesByModeRef.current[currentModeRef.current] = []
    setError(null)
    clearSpeechError()
    stopSpeaking()
    
    // Reset the load flag so new chat will load fresh
    hasLoadedRef.current = null
    previousMessagesLengthRef.current = 0
    persistedMessageIdsRef.current = new Set()
    // Detach from any current chat; a new chat will be created when the first message is sent
    if (clearCurrentChat) {
      clearCurrentChat()
    }
  }, [setMessages, setError, clearSpeechError, stopSpeaking, clearCurrentChat])

  // Load a specific chat
  const handleSelectChat = useCallback(async (chatId: string) => {
    if (!persistenceEnabled || !loadChat) return

    try {
      // Reset the load flag for the new chat
      hasLoadedRef.current = null
      persistedMessageIdsRef.current = new Set()
      
      // Clear current messages first
      setMessages([])
      messagesByModeRef.current[currentModeRef.current] = []
      previousMessagesLengthRef.current = 0
      
      // Load the chat (this will trigger the useEffect to load messages)
      const chat = await loadChat(chatId)
      const targetMode = chat?.mode ? (chat.mode as Mode) : mode
      if (chat && chat.mode && chat.mode !== mode) {
        setMode(targetMode)
      }

      // Eagerly load messages to ensure they render immediately
      if (chat) {
        const savedMessages = await loadPersistedMessages(chat.id)
        const formattedMessages = savedMessages.map((msg) => ({
          id: msg.id,
          role: msg.role as "user" | "assistant" | "system",
          content: msg.content,
          createdAt: msg.createdAt ? new Date(msg.createdAt as string) : undefined,
          isFavorite: msg.isFavorite,
        }))
        setMessages(formattedMessages)
        messagesByModeRef.current[targetMode] = formattedMessages
        hasLoadedRef.current = chat.id
        previousMessagesLengthRef.current = formattedMessages.length
      }
      
      // Close the history drawer
      setChatHistoryOpen(false)
    } catch (err) {
      console.error("Failed to load chat:", err)
    }
  }, [persistenceEnabled, loadChat, loadPersistedMessages, setMessages, mode, setMode])

  // Handle chat profile selection
  const handleProfileSelect = useCallback((profileId: string | null) => {
    setCurrentProfileId(profileId)
    // TODO: Optionally create a new chat with the selected profile
    // or filter chat history by profile
  }, [])

  // Handle URL parameters for mode, chatId, and profileId on mount
  useEffect(() => {
    if (typeof window === "undefined" || !isMounted) return
    
    const params = new URLSearchParams(window.location.search)
    const modeParam = params.get("mode")
    const chatIdParam = params.get("chatId")
    const profileIdParam = params.get("profileId")
    
    // Set mode if provided in URL
    if (modeParam && modeParam in MODES) {
      setMode(modeParam as Mode)
    }
    
    // Load chat if chatId is provided
    if (chatIdParam) {
      handleSelectChat(chatIdParam)
    }
    
    // Set profile if profileId is provided
    if (profileIdParam) {
      setCurrentProfileId(profileIdParam)
    }
  }, [isMounted, handleSelectChat])

  // Handle chat deletion
  const handleDeleteChat = useCallback(async (chatId: string) => {
    // If deleting current chat, clear it
    if (currentChat?.id === chatId) {
      clearCurrentChat()
      setMessages([])
      messagesByModeRef.current[mode] = []
      hasLoadedRef.current = null
      previousMessagesLengthRef.current = 0
      persistedMessageIdsRef.current = new Set()
    }
    // Optimistically remove from local list
    setAllChats((prev) => prev.filter((c) => c.id !== chatId))
    // Refresh the list
    await refreshChats()
  }, [currentChat, mode, clearCurrentChat, setMessages, refreshChats])

  const handleRenameChat = useCallback(async (chatId: string, title: string) => {
    if (!persistenceEnabled) return
    try {
      try {
        const existing = await chatService.getChatById(chatId)
        console.log("Renaming chat - fetched existing:", existing)
      } catch (fetchErr) {
        console.warn("Could not fetch existing chat before rename:", fetchErr)
      }

      const updated = await chatService.updateChat(chatId, { title })
      console.log("Chat renamed on server:", updated)

      // Optimistically update local list
      setAllChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, title: updated.title } : c)))
      // Notify user of success
      try {
        toast({ title: "Chat renamed", description: `Renamed to '${updated.title}'` })
      } catch {}
      // If the current chat was renamed, also update currentChat state so UI persists without reload
      try {
        if (currentChat?.id === chatId) {
          // @ts-ignore
          if (typeof setCurrentChat === 'function') {
            // @ts-ignore
            setCurrentChat((prev: any) => prev ? { ...prev, title: updated.title } : prev)
          }
        }
      } catch (e) {
        // ignore
      }
    } catch (err) {
      console.error("Failed to rename chat", err)
      try {
        const message = err && (err as any).message ? (err as any).message : String(err)
        toast({ title: "Rename failed", description: message })
      } catch {}
    }
  }, [persistenceEnabled])

  const handleFavoriteChange = useCallback((messageId: string, isFavorite: boolean) => {
    setMessages((prev: any[]) => {
      const next = prev.map((msg: any) => msg.id === messageId ? { ...msg, isFavorite } : msg)
      messagesByModeRef.current[currentModeRef.current] = next
      return next
    })
  }, [])

  // Load all chats when mode changes or user becomes authenticated
  useEffect(() => {
    if (persistenceEnabled) {
      // Don't block UI - load chats in background with longer timeout tolerance
      refreshChats().catch(err => {
        console.log("Background chat refresh failed (this is OK):", err.message)
        // Ensure loading state is cleared even if refresh fails
        setIsLoadingAllChats(false)
      })
    } else {
      // Clear chats and loading state when not authenticated
      setAllChats([])
      setIsLoadingAllChats(false)
    }
  }, [persistenceEnabled, mode, refreshChats])

  const handleVoiceInput = useCallback(() => {
    startListening((transcript: string) => {
      setInput(transcript)
    })
  }, [startListening, setInput])

  const handleModeChange = useCallback(
    (nextMode: Mode) => {
      if (!canUseMode(nextMode)) {
        setNavigationOpen(false)
        return
      }
      if (nextMode === mode) return
      messagesByModeRef.current[currentModeRef.current] = [...messages]
      setMode(nextMode)
      setError(null)
      clearSpeechError()
      setNavigationOpen(false)
      const nextMessages = messagesByModeRef.current[nextMode] || []
      setMessages(nextMessages)
    },
    [canUseMode, mode, messages, setMessages, clearSpeechError],
  )

  const handleProviderChange = useCallback(
    (nextProvider: Provider) => {
      if (PROVIDERS[nextProvider].requiresApiKey && !apiKeys[nextProvider]) {
        setSelectedProvider(nextProvider as KeyProvider)
        setTempApiKey("")
        setIsApiKeyDialogOpen(true)
        setError(`Add your ${PROVIDERS[nextProvider].name} API key to continue.`)
        return
      }

      setProvider(nextProvider)
      // Reset to provider default model unless a custom is already set for that provider
      setModelPreferences((prev) => ({
        ...prev,
        [nextProvider]: prev[nextProvider] || PROVIDERS[nextProvider].models[0],
      }))
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

    if (
      selectedProvider !== "openai" &&
      selectedProvider !== "claude" &&
      selectedProvider !== "huggingface" &&
      selectedProvider !== "groq" &&
      selectedProvider !== "gemini"
    ) {
      setIsApiKeyDialogOpen(false)
      return
    }

    const updatedKeys: ApiKeyMap = {
      ...apiKeys,
      [selectedProvider]: tempApiKey.trim(),
    }

    setApiKeys(updatedKeys)
    localStorage.setItem("radhika-api-keys", JSON.stringify(updatedKeys))

    if (selectedProvider === "openai" || selectedProvider === "claude" || selectedProvider === "groq" || selectedProvider === "gemini") {
      setProvider(selectedProvider as Provider)
    }
    setError(null)
    clearSpeechError()
    setIsApiKeyDialogOpen(false)
    setTempApiKey("")
  }, [apiKeys, selectedProvider, tempApiKey, clearSpeechError])

  const handleRemoveApiKey = useCallback(() => {
    if (
      selectedProvider !== "openai" &&
      selectedProvider !== "claude" &&
      selectedProvider !== "huggingface" &&
      selectedProvider !== "groq" &&
      selectedProvider !== "gemini"
    ) {
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

  const handleOpenApiKeyDialog = useCallback((p: KeyProvider = "openai") => {
    setSelectedProvider(p)
    setTempApiKey(apiKeys[p] ?? "")
    setIsApiKeyDialogOpen(true)
    setError(null)
  }, [apiKeys])

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

      // For guests, prompt for API key if provider requires one
      if (PROVIDERS[provider].requiresApiKey && !apiKeys[provider]) {
        setSelectedProvider(provider as KeyProvider)
        setTempApiKey("")
        setIsApiKeyDialogOpen(true)
        setError(`Add your ${PROVIDERS[provider].name} API key to continue.`)
        return
      }

      // Prevent duplicate submissions
      if (isChatLoading || isGeneratingImageRef.current) {
        console.log("Already processing, skipping duplicate submission")
        return
      }

      // Auto-detect image generation keywords and patterns
      const lowerPrompt = promptText.toLowerCase()
      
      // Direct action keywords - these must be explicit about image generation
      const actionKeywords = [
        'generate image',
        'create image',
        'make image',
        'generate an image',
        'create an image',
        'make an image',
        'draw an image',
        'draw a picture',
        'draw me',
        'generate picture',
        'create picture',
        'make picture',
        'generate a picture',
        'create a picture',
        'make a picture',
        'generate photo',
        'create photo',
        'make photo',
        'generate a photo',
        'create a photo',
        'make a photo',
        'show me an image',
        'show me a picture',
        'show me a photo',
        'design an image',
        'produce an image',
        'render an image',
        'paint a picture',
        'paint an image',
        'sketch a picture',
        'sketch an image',
        'illustrate this',
        'visualize this',
      ]
      
      // Descriptive patterns that indicate image generation intent
      const descriptivePatterns = [
        /^image of (a|an|the)/i,  // Must start with "image of"
        /^picture of (a|an|the)/i,
        /^photo of (a|an|the)/i,
        /\[image:/i,  // Markdown-style image descriptions
        /^(draw|paint|sketch|illustrate|visualize)\s+(a|an|the|me)\s/i,  // Must start with art action
        /(generate|create|make)\s+(a|an|the)?\s*(image|picture|photo|artwork|illustration)\s+(of|showing|depicting)/i,
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

      isGeneratingImageRef.current = true
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
        isGeneratingImageRef.current = false
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
        // Cancel any previous in-flight image request before starting a new one
        imageAbortControllerRef.current?.abort()
        const abortController = new AbortController()
        imageAbortControllerRef.current = abortController

        const response = await fetch("/api/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: abortController.signal,
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
        
        // Persist the image message to database (use refs for current values)
        const currentPersistenceEnabled = persistenceEnabledRef.current
        const chatToUse = currentChatRef.current
        
        if (currentPersistenceEnabled && chatToUse && placeholderId && !persistedMessageIdsRef.current.has(placeholderId)) {
          console.log(`💾 Persisting image message: ${placeholderId} 📸 to chat: ${chatToUse.id}`)
          try {
            await chatService.addMessage(
              chatToUse.id,
              "assistant",
              markdown,
              undefined,
              placeholderId
            )
            persistedMessageIdsRef.current.add(placeholderId)
            console.log("✅ Image message persisted successfully")
          } catch (err) {
            console.error("❌ Failed to persist image message:", err)
          }
        } else {
          console.log("⚠️ Skipping image persistence:", {
            persistenceEnabled: currentPersistenceEnabled,
            hasChat: !!chatToUse,
            chatId: chatToUse?.id,
            placeholderId,
            alreadyPersisted: persistedMessageIdsRef.current.has(placeholderId)
          })
        }
      } catch (error) {
        const isAbort = (error instanceof DOMException && error.name === "AbortError") ||
          (error instanceof Error && /abort/i.test(error.message))
        const message = error instanceof Error ? error.message : "Image generation failed"
        setMessages((prev: any) =>
          prev.map((entry: any) =>
            entry.id === placeholderId
              ? isAbort
                ? { ...entry, content: "_Image generation cancelled._" }
                : { ...entry, content: `Image generation failed: ${message}` }
              : entry,
          ),
        )
      } finally {
        imageAbortControllerRef.current = null
        isGeneratingImageRef.current = false
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

  useEffect(() => {
    handleComposerSubmitRef.current = handleComposerSubmit
  }, [handleComposerSubmit])

  // Helper function to send chat message and handle streaming
  const sendChatMessage = useCallback(async (userMessage: any) => {
    // Prevent duplicate submissions
    if (isChatLoading) {
      console.log('Already loading, skipping duplicate request')
      return
    }
    
    setIsChatLoading(true)

    // Cancel any previous in-flight request
    chatAbortControllerRef.current?.abort()
    const abortController = new AbortController()
    chatAbortControllerRef.current = abortController
    
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
          signal: abortController.signal,
          body: JSON.stringify({
            messages: currentMessages,
            mode,
            provider,
            userGender: userPersonalization.gender,
            userAge: userPersonalization.age,
            conversationTone: mode === "bff" ? undefined : userPersonalization.tone,
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
          // Cancel reader on stream error
          try {
            await reader.cancel()
          } catch {
            // ignore
          }
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
        
        // Auto-speak the response if voice is enabled
        if (voiceEnabledRef.current && accumulatedContent) {
          speakMessage(accumulatedContent, undefined, mode)
        }
    } catch (error) {
      console.error('❌ Chat error:', error)
      const isAbort = (error instanceof DOMException && error.name === 'AbortError') ||
        (error instanceof Error && /abort/i.test(error.message))
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      // Add error message only if we don't already have an empty assistant message
      setMessages((prev: any) => {
        const hasEmptyAssistant = prev.some((msg: any) => msg.id === assistantMessageId && !msg.content)
        if (hasEmptyAssistant) {
          // Remove the empty assistant message
          return prev.filter((msg: any) => msg.id !== assistantMessageId)
        }
        if (isAbort) {
          // User cancelled. Don't add error noise.
          return prev
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
      chatAbortControllerRef.current = null
    }
  }, [mode, provider, currentApiKey, setMessages, speakMessage])

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
            imageAbortControllerRef.current?.abort()
            const abortController = new AbortController()
            imageAbortControllerRef.current = abortController

            const response = await fetch("/api/image", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: abortController.signal,
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
            const isAbort = (error instanceof DOMException && error.name === "AbortError") ||
              (error instanceof Error && /abort/i.test(error.message))
            const errorMessage = error instanceof Error ? error.message : "Image generation failed"
            setMessages((current: any) =>
              current.map((msg: any) =>
                msg.id === messageId
                  ? { ...msg, content: isAbort ? "_Image generation cancelled._" : `Image generation failed: ${errorMessage}` }
                  : msg
              )
            )
          } finally {
            imageAbortControllerRef.current = null
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
      table: ({ children }) => (
        <div className="my-3 overflow-x-auto">
          <table className={`min-w-full border-collapse text-sm ${uiStyle === "pixel" ? "pixel-font text-xs" : ""}`}>
            {children}
          </table>
        </div>
      ),
      thead: ({ children }) => (
        <thead className="bg-slate-100 dark:bg-slate-800">
          {children}
        </thead>
      ),
      tbody: ({ children }) => (
        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
          {children}
        </tbody>
      ),
      tr: ({ children }) => (
        <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
          {children}
        </tr>
      ),
      th: ({ children }) => (
        <th className="border border-slate-300 dark:border-slate-600 px-3 py-2 text-left font-semibold text-slate-900 dark:text-slate-100">
          {children}
        </th>
      ),
      td: ({ children }) => (
        <td className="border border-slate-300 dark:border-slate-600 px-3 py-2 text-slate-700 dark:text-slate-300">
          {children}
        </td>
      ),
    }),
    [uiStyle],
  )

  const availableModes = (Object.keys(MODES) as Mode[]).filter((modeKey) => canUseMode(modeKey))
  const allowedModes = availableModes.length ? availableModes : (["general"] as Mode[])
  const personalizationEnabled = isAuthenticated && canUsePersonalization
  const modeUpgradeCta = !isAuthenticated
    ? {
        label: "Sign up to unlock more modes",
        href: "/auth/signup",
        description: "Create a free account to access Productivity, Wellness, Learning, Creative, and BFF modes.",
      }
    : undefined

  const modeCounts: Record<Mode, number> = {
    general: messagesByModeRef.current.general.length,
    productivity: messagesByModeRef.current.productivity.length,
    wellness: messagesByModeRef.current.wellness.length,
    learning: messagesByModeRef.current.learning.length,
    creative: messagesByModeRef.current.creative.length,
    bff: messagesByModeRef.current.bff.length,
  }
  const activityMessages = messagesByModeRef.current[mode] ?? []

  // Show the insights panel for guests by default. For authenticated users the panel
  // is collapsible and follows `isInsightsCollapsed`. For guests it's always visible
  // and not collapsible.
  const insightsPanel = (!isAuthenticated || !isInsightsCollapsed) ? (
    <InsightsPanel uiStyle={uiStyle} collapsible={isAuthenticated} onCollapse={() => isAuthenticated && setIsInsightsCollapsed(true)}>
  <ActivityMatrix key={String(isAuthenticated)} messages={activityMessages} currentMode={mode} uiStyle={uiStyle} isAuthenticated={isAuthenticated} />
    </InsightsPanel>
  ) : null

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
          isAuthenticated={isAuthenticated}
          onOpenApiKeys={handleOpenApiKeyDialog}
          apiKeyProvider={provider as KeyProvider}
          onOpenPersonalization={undefined}
          showHistoryToggle={isAuthenticated}
          historyOpen={chatHistoryOpen}
          onToggleHistory={() => setChatHistoryOpen(prev => !prev)}
          showHeatmapToggle={isAuthenticated}
          heatmapOpen={!isInsightsCollapsed}
          onToggleHeatmap={() => {
            if (!isAuthenticated) return
            setIsInsightsCollapsed((prev) => !prev)
          }}
          userPersonalization={userPersonalization}
          showCloseButton
          showQuickActions={false}
          allowedModes={allowedModes}
          modeCta={modeUpgradeCta}
          onNewChat={isAuthenticated ? handleNewChat : undefined}
        />
      </SidebarDrawer>

      <ChatAppShell
        isPixel={uiStyle === "pixel"}
  // When insightsPanel is present reserve the right column; if it's collapsed the
  // chat section will grow to use the freed space.
  hasInsights={Boolean(insightsPanel)}
        sidebar={
          <SidebarNav
            mode={mode}
            modes={MODES}
            quickActions={QUICK_ACTIONS[mode]}
            onModeChange={handleModeChange}
            onQuickAction={handleQuickAction}
            modeCounts={modeCounts}
            uiStyle={uiStyle}
            isAuthenticated={isAuthenticated}
            onOpenApiKeys={handleOpenApiKeyDialog}
            apiKeyProvider={provider as KeyProvider}
            onOpenPersonalization={undefined}
            showHistoryToggle={isAuthenticated}
            historyOpen={chatHistoryOpen}
            onToggleHistory={() => setChatHistoryOpen(prev => !prev)}
            showHeatmapToggle={isAuthenticated}
            heatmapOpen={!isInsightsCollapsed}
            onToggleHeatmap={() => {
              if (!isAuthenticated) return
              setIsInsightsCollapsed((prev) => !prev)
            }}
            userPersonalization={userPersonalization}
            allowedModes={allowedModes}
            modeCta={modeUpgradeCta}
            onNewChat={isAuthenticated ? handleNewChat : undefined}
          />
        }
        topbar={
          <ChatTopbar
            mode={mode}
            modeMeta={currentMode}
            uiStyle={uiStyle}
            onToggleUI={() => setUIStyle(uiStyle === "modern" ? "pixel" : "modern")}
            darkMode={Boolean(isMounted && theme === "dark")}
            onToggleTheme={() => {
              // Guard theme toggle until mounted to avoid SSR/client mismatch
              if (!isMounted) return
              setTheme(theme === "dark" ? "light" : "dark")
            }}
            messageCount={messages.length}
            voiceEnabled={voiceEnabled}
            onToggleVoice={() => setVoiceEnabled(!voiceEnabled)}
            showVoiceToggle={voiceAllowed}
            onClearChat={clearChat}
            onOpenSidebar={() => setNavigationOpen(true)}
            onOpenHeatmap={() => {
              if (!isAuthenticated) return
              setIsInsightsCollapsed(false)
            }}
            providerLabel={providerLabel}
            error={combinedError ?? null}
            onDismissError={() => {
              setError(null)
              clearSpeechError()
            }}
            userMenu={<UserMenu />}
            heatmapAvailable={isAuthenticated}
            currentProfileId={currentProfileId}
            onProfileSelect={handleProfileSelect}
          />
        }
        insights={insightsPanel}
      >
        {/* Removed collapsed banner — insights column is always reserved on the right. */}
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
          isSpeaking={isSpeaking}
          currentSpeakingMessageId={currentMessageId}
          onSpeakMessage={speakMessage}
          onStopSpeaking={stopSpeaking}
          onFavoriteChange={handleFavoriteChange}
        />
        <ChatComposer
          input={input}
          onInputChange={handleInputChange}
          onSubmit={handleSubmit}
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
              : selectedProvider === "groq"
                ? Boolean(apiKeys.groq)
                : selectedProvider === "gemini"
                  ? Boolean(apiKeys.gemini)
                  : selectedProvider === "huggingface"
                    ? Boolean(apiKeys.huggingface)
                    : false
        }
        uiStyle={uiStyle}
      />

  {/* Personalization dialog moved to Settings page */}

      {/* Chat History Sidebar */}
      <SidebarDrawer 
        open={chatHistoryOpen} 
        onOpenChange={setChatHistoryOpen} 
        isPixel={uiStyle === "pixel"}
        side="right"
      >
        <ChatHistorySidebar
          chats={allChats}
          currentChatId={currentChat?.id}
          onSelectChat={handleSelectChat}
          onDeleteChat={handleDeleteChat}
            onRenameChat={handleRenameChat}
          onRefresh={refreshChats}
          isLoading={isLoadingAllChats}
        />
      </SidebarDrawer>

      <Analytics />
      <SpeedInsights />
    </>
  )
}
