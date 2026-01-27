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
import { cn } from "@/lib/utils"
import type { Provider, ProviderDefinition, UIStyle } from "@/types/chat"
import { ArrowUp, Check, Image, Key, Loader2, Mic, MicOff, MoreVertical, Settings2, Sparkles } from "lucide-react"
import type { FormEvent, KeyboardEvent, ChangeEvent } from "react"

interface MobileChatComposerProps {
  input: string
  onInputChange: (event: ChangeEvent<HTMLTextAreaElement>) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  placeholder: string
  isLoading: boolean
  isListening: boolean
  onVoiceInput: () => void
  provider: Provider
  providers: Record<Provider, ProviderDefinition>
  onProviderChange: (provider: Provider) => void
  uiStyle: UIStyle
  providerApiKeySet: Partial<Record<Provider, boolean>>
  imageGenerationEnabled: boolean
  onToggleImageGeneration: (enabled: boolean) => void
  onOpenImageSettings: () => void
  isGeneratingImage: boolean
  isAuthenticated: boolean
}

export function MobileChatComposer({
  input,
  onInputChange,
  onSubmit,
  placeholder,
  isLoading,
  isListening,
  onVoiceInput,
  provider,
  providers,
  onProviderChange,
  uiStyle,
  providerApiKeySet,
  imageGenerationEnabled,
  onToggleImageGeneration,
  onOpenImageSettings,
  isGeneratingImage,
  isAuthenticated,
}: MobileChatComposerProps) {
  const isPixel = uiStyle === "pixel"

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
      // On mobile, Enter adds new line (no auto-submit)
      return
    },
    [],
  )

  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 px-3 py-2 w-full",
        isPixel
          ? "pixel-panel border-t-2 border-slate-500/80 bg-slate-200 dark:bg-slate-900"
          : "bg-white/98 backdrop-blur-xl border-t border-slate-200/60 dark:bg-slate-900/98 dark:border-white/10",
      )}
    >
      <form onSubmit={onSubmit} className="w-full flex items-center gap-2">
        {/* Input container with just input and three-dots */}
        <div
          className={cn(
            "flex items-center gap-2 px-3 py-2 flex-1",
            isPixel
              ? "pixel-border bg-slate-100 dark:bg-slate-800"
              : "rounded-full bg-slate-100/80 dark:bg-slate-800/80",
          )}
        >
          {/* Text input - flex-1 to take remaining space */}
          <input
            type="text"
            value={input}
            onChange={(e) => {
              const syntheticEvent = {
                ...e,
                target: e.target as any,
                currentTarget: e.currentTarget as any,
              } as any
              onInputChange(syntheticEvent)
            }}
            onKeyDown={(e) => {
              // No auto-submit on mobile
              if (e.key === 'Enter') {
                e.preventDefault()
              }
            }}
            placeholder={placeholder}
            className={cn(
              "flex-1 border-0 bg-transparent shadow-none focus:outline-none focus:ring-0 text-sm px-2 py-2",
              "text-slate-900 dark:text-white",
              "placeholder:text-slate-400",
            )}
          />

          {/* Three dots menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  "h-8 w-8 flex-shrink-0 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300",
                  isPixel && "pixel-control",
                )}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              side="top"
              className={cn(
                "w-56 mb-2 border bg-white/98 backdrop-blur-xl dark:bg-slate-900/98",
                isPixel && "pixel-border pixel-shadow border-slate-500/80",
              )}
            >
              <DropdownMenuLabel className="text-xs uppercase text-slate-400">Model</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {Object.entries(providers).map(([key, meta]) => {
                const castKey = key as Provider
                const requiresKey = meta.requiresApiKey && !providerApiKeySet[castKey]
                const isActive = castKey === provider

                return (
                  <DropdownMenuItem
                    key={key}
                    onClick={() => onProviderChange(castKey)}
                    className="flex items-center justify-between"
                  >
                    <span className="text-sm font-medium">{meta.name}</span>
                    {isActive && <Check className="h-4 w-4" />}
                    {requiresKey && <Key className="h-3.5 w-3.5 text-slate-400" />}
                  </DropdownMenuItem>
                )
              })}
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs uppercase text-slate-400">Options</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onToggleImageGeneration(!imageGenerationEnabled)}
                className="flex items-center justify-between"
              >
                <span className="flex items-center gap-2 text-sm">
                  {imageGenerationEnabled ? <Sparkles className="h-4 w-4" /> : <Image className="h-4 w-4" />}
                  Image Generation
                </span>
                {imageGenerationEnabled && <Check className="h-4 w-4 text-cyan-500" />}
              </DropdownMenuItem>
              {isAuthenticated && imageGenerationEnabled && (
                <DropdownMenuItem onClick={onOpenImageSettings} className="text-sm">
                  <Settings2 className="h-4 w-4 mr-2" />
                  Image Settings
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Mic button - outside, before send */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onVoiceInput}
          disabled={isLoading}
          className={cn(
            "h-10 w-10 flex-shrink-0 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700",
            isPixel
              ? cn(
                  "pixel-control",
                  isListening ? "text-rose-600" : "text-slate-700 dark:text-slate-200"
                )
              : cn(
                  "text-slate-600 dark:text-slate-300",
                  isListening && "text-rose-500 bg-rose-50 dark:bg-rose-900/30"
                ),
          )}
          aria-label={isListening ? "Stop listening" : "Start voice input"}
        >
          {isListening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </Button>

        {/* Send button - outside, last */}
        {isLoading || isGeneratingImage ? (
          <Button
            type="submit"
            size="icon"
            className={cn(
              "h-10 w-10 flex-shrink-0 rounded-full text-white",
              isPixel
                ? "pixel-border pixel-shadow border-rose-400 bg-rose-600"
                : "bg-rose-600 shadow-md",
            )}
          >
            <Loader2 className="h-5 w-5 animate-spin" />
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon"
            disabled={!input || input.trim().length === 0}
            className={cn(
              "h-10 w-10 flex-shrink-0 rounded-full text-white transition-opacity",
              isPixel
                ? cn(
                    "pixel-border pixel-shadow",
                    pixelBgByColor[providers[provider].color] ?? "border-cyan-400 bg-cyan-600",
                  )
                : cn(
                    "bg-gradient-to-r shadow-md",
                    gradientByColor[providers[provider].color] ?? "from-cyan-500 to-blue-600",
                  ),
              (!input || input.trim().length === 0) && "opacity-50",
            )}
          >
            <ArrowUp className="h-5 w-5" />
          </Button>
        )}
      </form>
    </div>
  )
}
