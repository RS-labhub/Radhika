"use client"

import { useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/auth-context"
import type { Provider, ProviderDefinition, UIStyle } from "@/types/chat"
import { ArrowUp, Check, ChevronDown, Image, Key, Loader2, Mic, MicOff, Settings2, Sparkles, VolumeX } from "lucide-react"
import type { FormEvent, KeyboardEvent, ChangeEvent } from "react"

interface ChatComposerProps {
  input: string
  onInputChange: (event: ChangeEvent<HTMLTextAreaElement>) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  placeholder: string
  isLoading: boolean
  isListening: boolean
  isSpeaking: boolean
  onVoiceInput: () => void
  onStopSpeaking: () => void
  provider: Provider
  providers: Record<Provider, ProviderDefinition>
  onProviderChange: (provider: Provider) => void
  uiStyle: UIStyle
  providerApiKeySet: Partial<Record<Provider, boolean>>
  imageGenerationEnabled: boolean
  onToggleImageGeneration: (enabled: boolean) => void
  onOpenImageSettings: () => void
  imageSettingsLabel: string
  isGeneratingImage: boolean
}

export function ChatComposer({
  input,
  onInputChange,
  onSubmit,
  placeholder,
  isLoading,
  isListening,
  isSpeaking,
  onVoiceInput,
  onStopSpeaking,
  provider,
  providers,
  onProviderChange,
  uiStyle,
  providerApiKeySet,
  imageGenerationEnabled,
  onToggleImageGeneration,
  onOpenImageSettings,
  imageSettingsLabel,
  isGeneratingImage,
}: ChatComposerProps) {
  const isPixel = uiStyle === "pixel"
  const { isAuthenticated } = useAuth()

  const gradientByColor: Record<string, string> = {
    pink: "from-pink-500 to-rose-500",
    emerald: "from-emerald-500 to-teal-500",
    violet: "from-violet-500 to-indigo-500",
    orange: "from-orange-500 to-amber-500",
  }

  const pixelBgByColor: Record<string, string> = {
    pink: "border-pink-400 bg-pink-500",
    emerald: "border-emerald-400 bg-emerald-500",
    violet: "border-violet-400 bg-violet-500",
    orange: "border-orange-400 bg-orange-500",
  }

  const handleKey = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault()
        const form = event.currentTarget.form
        if (form) {
          form.requestSubmit()
        }
      }
    },
    [],
  )

  return (
    <div
      className={cn(
        "border px-3 py-3 sm:px-4 sm:py-4",
        isPixel
          ? "pixel-border pixel-surface pixel-shadow border-slate-500/80"
          : "rounded-[24px] border-white/60 bg-white/70 backdrop-blur-xl shadow-[0_22px_58px_-34px_rgba(15,23,42,0.42)] dark:border-white/10 dark:bg-slate-900/60",
      )}
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <Textarea
          value={input}
          onChange={onInputChange}
          onKeyDown={handleKey}
          placeholder={isPixel ? `${placeholder}`.toUpperCase() : placeholder}
          className={cn(
            "max-h-40 min-h-[100px] resize-none border px-3 py-3 text-base text-slate-900 shadow-none focus-visible:ring-0 dark:text-white",
            isPixel
              ? "pixel-border pixel-shadow border-slate-500/80 bg-slate-200 text-slate-800 placeholder-slate-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              : "rounded-2xl border-white/40 bg-white/70 backdrop-blur placeholder:text-slate-400 focus-visible:border-cyan-400/70 dark:border-white/10 dark:bg-slate-900/60",
          )}
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="hidden sm:flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.32em] text-slate-400 dark:text-slate-500">
            <span className={cn(isPixel && "pixel-font text-[10px]")}>Enter to send</span>
            <span>•</span>
            <span className={cn(isPixel && "pixel-font text-[10px]")}>Shift + Enter for newline</span>
          </div>
          <div className="flex items-center justify-end gap-2 flex-wrap sm:flex-nowrap">
            <TooltipProvider>
              <Tooltip delayDuration={100}>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-pressed={imageGenerationEnabled}
                    onClick={() => onToggleImageGeneration(!imageGenerationEnabled)}
                    className={cn(
                      "h-10 w-10 rounded-2xl border",
                      isPixel
                        ? cn(
                            "pixel-border pixel-shadow border-slate-500/80 bg-slate-200 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100",
                            imageGenerationEnabled && "border-cyan-400 bg-cyan-500 text-white",
                          )
                        : cn(
                            "border-white/40 bg-white/70 text-slate-600 backdrop-blur hover:bg-white/80 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200",
                            imageGenerationEnabled &&
                              "border-transparent bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg hover:opacity-95",
                          ),
                    )}
                  >
                    {imageGenerationEnabled ? <Sparkles className="h-4 w-4" /> : <Image className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {imageGenerationEnabled ? "Disable image generation" : "Enable image generation"}
                </TooltipContent>
              </Tooltip>
              {isAuthenticated ? (
                <Tooltip delayDuration={100}>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={onOpenImageSettings}
                      disabled={!imageGenerationEnabled}
                      aria-label="Configure image generation"
                      className={cn(
                        "h-10 w-10 rounded-2xl border",
                        isPixel
                          ? "pixel-border pixel-shadow border-slate-500/80 bg-slate-200 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                          : "border-white/40 bg-white/70 text-slate-600 backdrop-blur hover:bg-white/80 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200",
                        !imageGenerationEnabled && "opacity-50",
                      )}
                    >
                      <Settings2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs max-w-xs text-center">
                    {imageSettingsLabel || "Configure image generation"}
                  </TooltipContent>
                </Tooltip>
              ) : null}
            </TooltipProvider>
            {isSpeaking ? (
              <Button
                type="button"
                variant="ghost"
                onClick={onStopSpeaking}
                className={cn(
                  "h-10 w-10 rounded-2xl border p-0 text-rose-600 dark:text-rose-300",
                  isPixel
                    ? "pixel-border pixel-shadow border-rose-500/70 bg-rose-100 hover:bg-rose-200 dark:border-rose-500 dark:bg-rose-900/40"
                    : "border-rose-200/70 bg-rose-50/80 hover:bg-rose-100 dark:border-rose-500/40 dark:bg-rose-900/30",
                )}
              >
                <VolumeX className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                onClick={onVoiceInput}
                disabled={isLoading}
                className={cn(
                  "h-10 w-10 rounded-2xl border p-0",
                  isPixel
                    ? cn(
                        "pixel-border pixel-shadow border-slate-500/80",
                        isListening
                          ? "bg-rose-200 text-rose-700 hover:bg-rose-300"
                          : "bg-slate-200 text-slate-700 hover:bg-slate-100",
                      )
                    : cn(
                        "border-white/40 bg-white/70 text-slate-700 backdrop-blur hover:bg-white/80 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200",
                        isListening && "border-rose-300/70 bg-rose-50/70 text-rose-500 dark:border-rose-500/40 dark:bg-rose-900/30 dark:text-rose-300",
                      ),
                )}
                aria-pressed={isListening}
                aria-label={isListening ? "Stop listening" : "Start voice input"}
              >
                {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className={cn(
                    "h-10 rounded-2xl border px-3 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white",
                    isPixel
                      ? "pixel-border pixel-shadow border-slate-500/80 bg-slate-200 text-slate-800 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                      : "border-white/40 bg-white/70 backdrop-blur hover:bg-white/80 dark:border-white/10 dark:bg-slate-900/60",
                  )}
                >
                  {providers[provider].name}
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className={cn(
                  "w-48 border bg-white/95 backdrop-blur dark:bg-slate-900/95",
                  isPixel && "pixel-border pixel-shadow border-slate-500/80 bg-slate-200 dark:border-slate-600 dark:bg-slate-900",
                )}
              >
                <DropdownMenuLabel className={cn("text-xs uppercase text-slate-400", isPixel && "pixel-font text-[10px]")}>Providers</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-slate-200 dark:bg-slate-700" />
                {Object.entries(providers).map(([key, meta]) => {
                  const castKey = key as Provider
                  const requiresKey = meta.requiresApiKey && !providerApiKeySet[castKey]
                  const hasModels = meta.models[0]
                  const isActive = castKey === provider

                  return (
                    <DropdownMenuItem
                      key={key}
                      onClick={() => onProviderChange(castKey)}
                      className={cn(
                        "flex items-center justify-between gap-2 text-sm",
                        isPixel && "pixel-font text-xs",
                      )}
                    >
                      <span className="flex flex-col">
                        <span className="font-medium text-slate-700 dark:text-slate-100">{meta.name}</span>
                        {hasModels && (
                          <span className="text-[11px] text-slate-400 dark:text-slate-500">{meta.models[0]}</span>
                        )}
                      </span>
                      {isActive ? <Check className="h-4 w-4" /> : requiresKey ? <Key className="h-3.5 w-3.5" /> : null}
                    </DropdownMenuItem>
                  )
                })}
              </DropdownMenuContent>
            </DropdownMenu>
            {isLoading || isGeneratingImage ? (
              <Button
                type="submit"
                className={cn(
                  "flex h-10 items-center justify-center rounded-2xl border px-4 text-sm font-medium text-white",
                  isPixel
                    ? "pixel-border pixel-shadow border-rose-400 bg-rose-600 hover:bg-rose-700"
                    : "border-none bg-rose-600 shadow-lg hover:bg-rose-700",
                )}
              >
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={isGeneratingImage || !input || input.trim().length === 0}
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-2xl border text-white transition-opacity",
                  isPixel
                    ? cn(
                        "pixel-border pixel-shadow",
                        pixelBgByColor[providers[provider].color] ?? "border-cyan-400 bg-cyan-600",
                      )
                    : cn(
                        "bg-gradient-to-r",
                        gradientByColor[providers[provider].color] ?? "from-cyan-500 to-blue-600",
                        "border-none shadow-lg hover:opacity-90",
                      ),
                  (isGeneratingImage || !input || input.trim().length === 0) && "opacity-50",
                )}
              >
                {isGeneratingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  )
}
