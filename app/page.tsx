"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { FormEvent } from "react"
import { Analytics } from "@vercel/analytics/react"
import { SpeedInsights } from "@vercel/speed-insights/next"
import { useTheme } from "next-themes"

// Components
import { ChatAppShell } from "@/components/chat/app-shell"
import { SidebarNav } from "@/components/chat/sidebar-nav"
import { ChatTopbar } from "@/components/chat/topbar"
import { ChatFeed } from "@/components/chat/chat-feed"
import { ChatComposer } from "@/components/chat/chat-composer"
import { SidebarDrawer } from "@/components/chat/sidebar-drawer"
import { ChatHistorySidebar } from "@/components/chat/chat-history-sidebar"
import { InsightsPanel } from "@/components/chat/insights-panel"
import { ActivityMatrix } from "@/components/activity-matrix"
import { ApiKeyDialog } from "@/components/dialog/api-key-dialog"
import { ImageSettingsDialog } from "@/components/dialog/image-settings-dialog"
import { ExportDialog } from "@/components/chat/export-dialog"
import { UserMenu } from "@/components/auth/user-menu"

// Hooks
import { useChatPersistence } from "@/hooks/use-chat-persistence"
import { useSpeech } from "@/hooks/use-speech"
import { useFeatureAccess } from "@/hooks/use-feature-access"
import { useAuth } from "@/contexts/auth-context"
import { useToast } from "@/components/ui/use-toast"
import { useApiKeys } from "@/hooks/use-api-keys"
import { useImageGeneration } from "@/hooks/use-image-generation"
import { useChatEngine } from "@/hooks/use-chat-engine"
import { usePersistenceSync } from "@/hooks/use-persistence-sync"
import { useChatActions } from "@/hooks/use-chat-actions"

// Lib / utils
import { useMarkdownComponents } from "@/lib/chat/markdown-components"
import { MODES, PROVIDERS, KEY_PROVIDER_METADATA, QUICK_ACTIONS, STORAGE_KEYS } from "@/lib/constants"

// Types
import type { KeyProvider, Mode, Provider, UIStyle, UserPersonalization, Chat } from "@/types/chat"
import type { ImageProviderId } from "@/types/image"

const { PERSONALIZATION: PERSONALIZATION_STORAGE_KEY } = STORAGE_KEYS

type ProviderModelMap = Record<Provider, string>

// Main component
export default function FuturisticRadhika() {
  // Theme and mount
  const { theme, setTheme } = useTheme()
  const [isMounted, setIsMounted] = useState(false)
  useEffect(() => { setIsMounted(true) }, [])

  // Core UI state
  const [mode, setMode] = useState<Mode>("general")
  const [provider, setProvider] = useState<Provider>("gemini")
  const [uiStyle, setUIStyle] = useState<UIStyle>("modern")
  const [error, setError] = useState<string | null>(null)
  const [navigationOpen, setNavigationOpen] = useState(false)
  const [chatHistoryOpen, setChatHistoryOpen] = useState(false)
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false)
  const [isInsightsCollapsed, setIsInsightsCollapsed] = useState(false)
  const [currentProfileId, setCurrentProfileId] = useState<string | null>(null)

  // Sources state
  const [sourcesEnabled, setSourcesEnabled] = useState(false)
  const [sourcesType, setSourcesType] = useState<"any" | "wikipedia" | "documentation">("any")

  // User personalization
  const [userPersonalization, setUserPersonalization] = useState<UserPersonalization>({
    gender: "male",
    age: "teenage",
    tone: "friendly",
  })

  // Model preferences
  const [modelPreferences, setModelPreferences] = useState<ProviderModelMap>(() => ({
    groq: PROVIDERS.groq.models[0],
    gemini: PROVIDERS.gemini.models[0],
    openai: PROVIDERS.openai.models[0],
    claude: PROVIDERS.claude.models[0],
  }))

  const resolveModel = useCallback(
    (providerKey: Provider) => {
      const pref = modelPreferences[providerKey]
      if (pref?.startsWith("custom:")) return pref.replace("custom:", "") || pref
      return pref
    },
    [modelPreferences],
  )

  // Auth and feature access
  const { isAuthenticated, canUseMode, canUsePersonalization } = useFeatureAccess()
  const { user } = useAuth()
  const { toast } = useToast()

  // Speech
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

  const voiceEnabledRef = useRef(voiceEnabled)
  voiceEnabledRef.current = voiceEnabled

  const [voiceAllowed, setVoiceAllowed] = useState(false)

  // API keys (extracted hook)
  const {
    apiKeys,
    currentApiKey,
    selectedProvider,
    tempApiKey,
    isApiKeyDialogOpen,
    setSelectedProvider,
    setTempApiKey,
    setIsApiKeyDialogOpen,
    handleSaveApiKey,
    handleRemoveApiKey,
    handleApiDialogChange,
    handleOpenApiKeyDialog,
    promptForProviderKey,
    ensureProviderKey,
    providerApiKeySet,
  } = useApiKeys(provider, setProvider, setError, clearSpeechError)

  // Chat persistence
  const {
    currentChat,
    isLoadingChat,
    loadMessages: loadPersistedMessages,
    addMessage: persistMessage,
    createNewChat,
    loadChat,
    getAllChats,
    clearCurrentChat,
    updateChatTitle,
    deleteAllChats: deleteAllLocalChats,
    isEnabled: persistenceEnabled,
    getQueueStatus,
    syncQueue,
    subscribeToQueue,
  } = useChatPersistence(mode, currentProfileId || undefined)

  // Chat engine (extracted hook)
  const chatEngine = useChatEngine({
    mode,
    provider,
    currentApiKey,
    userPersonalization,
    speakMessage,
    voiceEnabledRef,
    sourcesEnabled,
    sourcesType,
  })

  const {
    messages,
    setMessages,
    input,
    isChatLoading,
    isChatLoadingRef,
    chatAbortControllerRef,
    handleInputChange,
    setInput,
    sendChatMessage,
    stopStreaming,
    handleComposerSubmitRef,
  } = chatEngine

  const isLoading = isChatLoading

  // Ref to bridge setAllChats from chatActions into persistSync
  const chatActionsSetAllChatsRef = useRef<React.Dispatch<React.SetStateAction<Chat[]>>>(() => {})

  // Persistence sync (extracted hook)
  const persistSync = usePersistenceSync({
    mode,
    provider,
    resolveModel,
    messages,
    setMessages,
    isLoading,
    persistenceEnabled,
    currentChat,
    loadPersistedMessages,
    createNewChat,
    setAllChats: (fn: any) => {
      chatActionsSetAllChatsRef.current?.(fn)
    },
  })

  const {
    persistedMessageIdsRef,
    isCreatingChatRef,
    isRestoringRef,
    hasLoadedRef,
    previousMessagesLengthRef,
    currentChatRef,
    persistenceEnabledRef,
    messagesByModeRef,
    currentModeRef,
    chatIdByModeRef,
    persistAssistantMessage,
    resetPersistenceTracking,
  } = persistSync

  // Chat actions (extracted hook)
  const chatActions = useChatActions({
    mode,
    currentProfileId,
    setCurrentProfileId,
    persistenceEnabled,
    currentChat,
    clearCurrentChat,
    loadChat,
    loadPersistedMessages,
    getAllChats,
    updateChatTitle,
    setMode,
    messages,
    setMessages,
    setError,
    clearSpeechError,
    stopSpeaking,
    toast,
    messagesByModeRef,
    currentModeRef,
    currentChatRef,
    hasLoadedRef,
    previousMessagesLengthRef,
    persistedMessageIdsRef,
  })

  const {
    allChats,
    isLoadingAllChats,
    setAllChats,
    handleNewChat: handleNewChatBase,
    handleSelectChat,
    handleDeleteChat,
    handleDeleteAllChats,
    handleRenameChat,
    handleFavoriteChange,
    handleProfileSelect,
    refreshChats,
  } = chatActions

  // Keep bridge ref in sync
  useEffect(() => {
    chatActionsSetAllChatsRef.current = setAllChats
  }, [setAllChats])

  // Image generation (extracted hook)
  const imageGen = useImageGeneration(
    mode,
    { openai: apiKeys.openai, huggingface: apiKeys.huggingface },
    ensureProviderKey,
    promptForProviderKey,
    setMessages,
  )

  const {
    imageGenerationEnabled,
    isImageSettingsDialogOpen,
    imageSettings,
    isGeneratingImage,
    isGeneratingImageRef,
    imageAbortControllerRef,
    imageSettingsLabel,
    setIsImageSettingsDialogOpen,
    handleToggleImageGeneration,
    handleOpenImageGenerationSettings,
    handleImageSettingsSave,
    handleImageRetry,
    generateImage,
    stopImageGeneration,
    detectImageIntent,
  } = imageGen

  // Pending queue tracking
  const [pendingQueueCount, setPendingQueueCount] = useState(0)

  useEffect(() => {
    const unsubscribe = subscribeToQueue((event: string) => {
      const status = getQueueStatus()
      setPendingQueueCount(status.messageCount + status.chatCount)

      if (event === "message-saved" || event === "chat-created") {
        toast({ title: "Synced successfully", description: "Pending messages have been saved to the cloud.", duration: 3000 })
      } else if (event === "message-failed" || event === "chat-failed") {
        toast({ title: "Sync failed", description: "Some messages could not be saved. Will retry later.", variant: "destructive", duration: 5000 })
      }
    })
    const status = getQueueStatus()
    setPendingQueueCount(status.messageCount + status.chatCount)
    return unsubscribe
  }, [subscribeToQueue, getQueueStatus, toast])

  // ---- Init effects (localStorage loads) ----

  // Load UI style
  useEffect(() => {
    if (typeof window === "undefined") return
    const savedStyle = localStorage.getItem("ui_style")
    if (savedStyle === "pixel" || savedStyle === "modern") setUIStyle(savedStyle)
  }, [])

  // Load personalization
  useEffect(() => {
    if (typeof window === "undefined") return
    const saved = localStorage.getItem(PERSONALIZATION_STORAGE_KEY)
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Partial<UserPersonalization>
        if (parsed) {
          setUserPersonalization((prev) => ({
            gender: parsed.gender && ["male", "female", "other"].includes(parsed.gender) ? parsed.gender : prev.gender,
            age: parsed.age && ["kid", "teenage", "mature", "senior"].includes(parsed.age) ? parsed.age : prev.age,
            tone: parsed.tone && ["professional", "casual", "friendly", "empathetic", "playful"].includes(parsed.tone) ? parsed.tone : prev.tone ?? "friendly",
          }))
        }
      } catch { /* ignore */ }
    }
  }, [])

  // Persist personalization
  useEffect(() => {
    if (typeof window === "undefined") return
    localStorage.setItem(PERSONALIZATION_STORAGE_KEY, JSON.stringify(userPersonalization))
  }, [userPersonalization])

  // Load model preferences
  useEffect(() => {
    if (typeof window === "undefined") return
    const storedModels = localStorage.getItem("radhika-provider-models")
    if (storedModels) {
      try {
        const parsed = JSON.parse(storedModels) as Partial<ProviderModelMap>
        setModelPreferences((prev) => ({
          groq: parsed.groq && PROVIDERS.groq.models.includes(parsed.groq) ? parsed.groq : prev.groq,
          gemini: parsed.gemini || prev.gemini,
          openai: parsed.openai || prev.openai,
          claude: parsed.claude || prev.claude,
        }))
      } catch { /* ignore */ }
    }
  }, [])

  // Voice preference
  useEffect(() => {
    if (typeof window === "undefined") return
    const storedVoice = localStorage.getItem("voice_enabled")
    const allowed = storedVoice === "true"
    setVoiceAllowed(allowed)
    setVoiceEnabled(allowed)
  }, [setVoiceEnabled])

  // Sources settings
  useEffect(() => {
    if (typeof window === "undefined") return
    setSourcesEnabled(localStorage.getItem("sources_enabled") === "true")
    const st = localStorage.getItem("sources_type") as "any" | "wikipedia" | "documentation"
    if (st) setSourcesType(st)

    const handle = (event: CustomEvent<{ enabled: boolean; type: string }>) => {
      setSourcesEnabled(event.detail.enabled)
      setSourcesType(event.detail.type as "any" | "wikipedia" | "documentation")
    }
    window.addEventListener("radhika:sourcesChanged", handle as EventListener)
    return () => window.removeEventListener("radhika:sourcesChanged", handle as EventListener)
  }, [])

  // Provider preference per user
  useEffect(() => {
    if (typeof window === "undefined" || !isAuthenticated || !user) return
    try {
      const key = `radhika-selected-provider:${user.id}`
      const saved = localStorage.getItem(key)
      if (saved && Object.prototype.hasOwnProperty.call(PROVIDERS, saved)) setProvider(saved as Provider)
    } catch { /* ignore */ }
  }, [isAuthenticated, user])

  // ---- Mode / auth enforcement ----

  useEffect(() => {
    if (!canUseMode(mode)) {
      const allowed = (Object.keys(MODES) as Mode[]).filter((m) => canUseMode(m))
      const fallback = allowed.includes("general") ? "general" : allowed[0] ?? "general"
      setMode(fallback)
      setMessages(messagesByModeRef.current[fallback] ?? [])
    }
  }, [mode, canUseMode, setMessages, messagesByModeRef])

  useEffect(() => {
    if (!isAuthenticated && mode !== "general") {
      setMode("general")
      setMessages(messagesByModeRef.current.general ?? [])
    }
  }, [isAuthenticated, mode, setMessages, messagesByModeRef])

  useEffect(() => {
    setIsInsightsCollapsed(!isAuthenticated)
  }, [isAuthenticated])

  // ---- Sign-out handler and clear chat ----

  const clearChat = useCallback(() => {
    setMessages([])
    messagesByModeRef.current[currentModeRef.current] = []
    setError(null)
    clearSpeechError()
    stopSpeaking()
  }, [setMessages, clearSpeechError, stopSpeaking, messagesByModeRef, currentModeRef])

  useEffect(() => {
    const handler = () => {
      try {
        clearChat()
        clearCurrentChat?.()
        resetPersistenceTracking()
      } catch { /* ignore */ }
    }
    if (typeof window !== "undefined") window.addEventListener("radhika:signOut", handler)
    return () => {
      if (typeof window !== "undefined") window.removeEventListener("radhika:signOut", handler)
    }
  }, [clearChat, clearCurrentChat, resetPersistenceTracking])

  // Wrap handleNewChat to also close sidebars
  const handleNewChat = useCallback(() => {
    handleNewChatBase()
    setChatHistoryOpen(false)
    setNavigationOpen(false)
  }, [handleNewChatBase])

  // ---- Composer submit (orchestrates chat vs image) ----

  const handleComposerSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const promptText = input.trim()
      if (!promptText) return

      // Guest: prompt for API key if needed
      if (PROVIDERS[provider].requiresApiKey && !apiKeys[provider]) {
        setSelectedProvider(provider as KeyProvider)
        setTempApiKey("")
        setIsApiKeyDialogOpen(true)
        return
      }

      if (isChatLoading || isGeneratingImageRef.current) {
        console.log("Already processing, skipping duplicate submission")
        return
      }

      const willGenerateImage = imageGenerationEnabled || detectImageIntent(promptText)

      const userMessage = { id: `user-${Date.now()}`, role: "user" as const, content: promptText }
      setInput("")
      setMessages((prev: any) => [...prev, userMessage])

      if (willGenerateImage) {
        const placeholderId = `image-${Date.now()}-${Math.random().toString(16).slice(2)}`
        await generateImage({
          promptText,
          placeholderId,
          setMessages,
          persistenceEnabledRef,
          currentChatRef,
          persistedMessageIdsRef,
        })
      } else {
        sendChatMessage(userMessage)
      }
    },
    [
      input, provider, apiKeys, isChatLoading, imageGenerationEnabled,
      setInput, setMessages, sendChatMessage, generateImage,
      isGeneratingImageRef, persistenceEnabledRef, currentChatRef, persistedMessageIdsRef,
      detectImageIntent, setSelectedProvider, setTempApiKey, setIsApiKeyDialogOpen,
    ],
  )

  useEffect(() => {
    handleComposerSubmitRef.current = handleComposerSubmit
  }, [handleComposerSubmit, handleComposerSubmitRef])

  // handleSubmit wraps stop-or-submit logic
  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault()

      if (isChatLoadingRef.current || isGeneratingImageRef.current) {
        if (isChatLoadingRef.current) stopStreaming()
        if (isGeneratingImageRef.current) stopImageGeneration()
        return
      }

      if (persistenceEnabled && !currentChat && createNewChat && !isCreatingChatRef.current) {
        isCreatingChatRef.current = true
        try {
          const newChat = await createNewChat()
          if (newChat) {
            hasLoadedRef.current = newChat.id
            persistedMessageIdsRef.current = new Set()
            setAllChats((prev: Chat[]) => {
              const exists = prev.some((c) => c.id === newChat.id || (c as any).localId === (newChat as any).localId)
              return exists ? prev : [newChat as Chat, ...prev]
            })
            await new Promise((r) => setTimeout(r, 100))
          }
        } catch { /* ignore */ } finally {
          isCreatingChatRef.current = false
        }
      }

      if (handleComposerSubmitRef.current) {
        await handleComposerSubmitRef.current(e)
      }
    },
    [
      persistenceEnabled, currentChat, createNewChat,
      stopStreaming, stopImageGeneration, setAllChats,
      isChatLoadingRef, isGeneratingImageRef, isCreatingChatRef,
      hasLoadedRef, persistedMessageIdsRef, handleComposerSubmitRef,
    ],
  )

  // URL params on mount
  useEffect(() => {
    if (typeof window === "undefined" || !isMounted) return
    const params = new URLSearchParams(window.location.search)
    const modeParam = params.get("mode")
    const chatIdParam = params.get("chatId")
    const profileIdParam = params.get("profileId")
    if (modeParam && modeParam in MODES) setMode(modeParam as Mode)
    if (chatIdParam) handleSelectChat(chatIdParam)
    if (profileIdParam) setCurrentProfileId(profileIdParam)
  }, [isMounted, handleSelectChat])

  // ---- Mode and provider change handlers ----

  const handleModeChange = useCallback(
    (nextMode: Mode) => {
      if (!canUseMode(nextMode)) { setNavigationOpen(false); return }
      if (nextMode === mode) return

      messagesByModeRef.current[currentModeRef.current] = [...messages]
      chatIdByModeRef.current[currentModeRef.current] = currentChat?.id || currentChat?.localId || null

      setMode(nextMode)
      setError(null)
      clearSpeechError()
      setNavigationOpen(false)

      setMessages(messagesByModeRef.current[nextMode] || [])
      const savedChatId = chatIdByModeRef.current[nextMode]
      if (savedChatId && loadChat) loadChat(savedChatId)
    },
    [canUseMode, mode, messages, setMessages, clearSpeechError, currentChat, loadChat, messagesByModeRef, currentModeRef, chatIdByModeRef],
  )

  const handleProviderChange = useCallback(
    (nextProvider: Provider) => {
      if (PROVIDERS[nextProvider].requiresApiKey && !apiKeys[nextProvider]) {
        setSelectedProvider(nextProvider as KeyProvider)
        setTempApiKey("")
        setIsApiKeyDialogOpen(true)
        return
      }
      setProvider(nextProvider)
      try {
        if (isAuthenticated && user && typeof window !== "undefined") {
          localStorage.setItem(`radhika-selected-provider:${user.id}`, nextProvider)
        }
      } catch { /* ignore */ }
      setModelPreferences((prev) => ({
        ...prev,
        [nextProvider]: prev[nextProvider] || PROVIDERS[nextProvider].models[0],
      }))
      setError(null)
      clearSpeechError()
    },
    [apiKeys, clearSpeechError, isAuthenticated, user, setSelectedProvider, setTempApiKey, setIsApiKeyDialogOpen],
  )

  // Scroll to bottom
  const messagesEndRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const id = setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100)
    return () => clearTimeout(id)
  }, [messages.length])

  // Quick action / voice
  const handleQuickAction = useCallback(
    (action: string) => { setInput(action); setError(null); clearSpeechError() },
    [setInput, clearSpeechError],
  )

  const handleVoiceInput = useCallback(() => {
    startListening((transcript: string) => setInput(transcript))
  }, [startListening, setInput])

  // ---- Derived values ----

  const combinedError = error || speechError
  const currentMode = useMemo(() => MODES[mode], [mode])
  const providerLabel = useMemo(() => PROVIDERS[provider].name, [provider])
  const MarkdownComponents = useMarkdownComponents(uiStyle)

  const formatTime = useCallback(
    (timestamp: number) => new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    [],
  )

  const availableModes = (Object.keys(MODES) as Mode[]).filter((m) => canUseMode(m))
  const allowedModes = availableModes.length ? availableModes : (["general"] as Mode[])
  const personalizationEnabled = isAuthenticated && canUsePersonalization
  const modeUpgradeCta = !isAuthenticated
    ? { label: "Sign up to unlock more modes", href: "/auth/signup", description: "Create a free account to access Productivity, Wellness, Learning, Creative, and BFF modes." }
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

  const insightsPanel =
    !isAuthenticated || !isInsightsCollapsed ? (
      <InsightsPanel
        uiStyle={uiStyle}
        collapsible={isAuthenticated}
        onCollapse={() => isAuthenticated && setIsInsightsCollapsed(true)}
      >
        <ActivityMatrix
          key={String(isAuthenticated)}
          messages={activityMessages}
          currentMode={mode}
          uiStyle={uiStyle}
          isAuthenticated={isAuthenticated}
        />
      </InsightsPanel>
    ) : null

  // ---- Render ----

  return (
    <>
      {/* Mobile sidebar drawer */}
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
          onToggleHistory={() => setChatHistoryOpen((prev) => !prev)}
          showHeatmapToggle={isAuthenticated}
          heatmapOpen={!isInsightsCollapsed}
          onToggleHeatmap={() => { if (!isAuthenticated) return; setIsInsightsCollapsed((prev) => !prev) }}
          userPersonalization={userPersonalization}
          showCloseButton
          showQuickActions={false}
          allowedModes={allowedModes}
          modeCta={modeUpgradeCta}
          onNewChat={isAuthenticated ? handleNewChat : undefined}
          onToggleTheme={() => { if (!isMounted) return; setTheme(theme === "dark" ? "light" : "dark") }}
          darkMode={Boolean(isMounted && theme === "dark")}
          onToggleUI={() => setUIStyle(uiStyle === "modern" ? "pixel" : "modern")}
          onExportChat={messages.length > 0 ? () => setIsExportDialogOpen(true) : undefined}
          messageCount={messages.length}
          onClearChat={!isAuthenticated ? clearChat : undefined}
        />
      </SidebarDrawer>

      {/* Main shell */}
      <ChatAppShell
        isPixel={uiStyle === "pixel"}
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
            onToggleHistory={() => setChatHistoryOpen((prev) => !prev)}
            showHeatmapToggle={isAuthenticated}
            heatmapOpen={!isInsightsCollapsed}
            onToggleHeatmap={() => { if (!isAuthenticated) return; setIsInsightsCollapsed((prev) => !prev) }}
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
            onToggleTheme={() => { if (!isMounted) return; setTheme(theme === "dark" ? "light" : "dark") }}
            messageCount={messages.length}
            voiceEnabled={voiceEnabled}
            onToggleVoice={() => setVoiceEnabled(!voiceEnabled)}
            showVoiceToggle={voiceAllowed}
            onClearChat={clearChat}
            onOpenSidebar={() => setNavigationOpen(true)}
            onOpenHeatmap={() => { if (!isAuthenticated) return; setIsInsightsCollapsed(false) }}
            providerLabel={providerLabel}
            error={combinedError ?? null}
            onDismissError={() => { setError(null); clearSpeechError() }}
            onExportChat={() => setIsExportDialogOpen(true)}
            userMenu={<UserMenu />}
            heatmapAvailable={isAuthenticated}
            currentProfileId={currentProfileId}
            onProfileSelect={handleProfileSelect}
            pendingQueueCount={pendingQueueCount}
            onSyncQueue={syncQueue}
          />
        }
        insights={insightsPanel}
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

      {/* Dialogs */}
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
        hasExistingKey={Boolean(apiKeys[selectedProvider])}
        uiStyle={uiStyle}
      />

      {/* Chat History Sidebar */}
      <SidebarDrawer open={chatHistoryOpen} onOpenChange={setChatHistoryOpen} isPixel={uiStyle === "pixel"} side="right">
        <ChatHistorySidebar
          chats={allChats}
          currentChatId={currentChat?.id}
          onSelectChat={handleSelectChat}
          onDeleteChat={handleDeleteChat}
          onDeleteAllChats={handleDeleteAllChats}
          onRenameChat={handleRenameChat}
          onRefresh={refreshChats}
          isLoading={isLoadingAllChats}
          onClose={() => setChatHistoryOpen(false)}
        />
      </SidebarDrawer>

      <ExportDialog
        open={isExportDialogOpen}
        onOpenChange={setIsExportDialogOpen}
        messages={messages.map((msg: any) => ({
          id: msg.id || `${Date.now()}-${Math.random()}`,
          chat_id: currentChat?.id || "",
          role: msg.role,
          content: msg.content,
          metadata: null,
          created_at: msg.createdAt || new Date().toISOString(),
          is_favorite: false,
        }))}
        chatTitle={`${currentMode.label} Chat`}
      />

      <Analytics />
      <SpeedInsights />
    </>
  )
}
