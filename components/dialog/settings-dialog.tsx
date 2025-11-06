"use client"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { KeyProvider, Provider, ProviderDefinition, UIStyle } from "@/types/chat"
import { Info, Key, Check, X } from "lucide-react"

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  apiKeys: { openai: string; claude: string; huggingface: string }
  providers: Record<Provider, ProviderDefinition>
  onManageProvider: (provider: KeyProvider) => void
  uiStyle: UIStyle
}

export function SettingsDialog({ open, onOpenChange, apiKeys, providers, onManageProvider, uiStyle }: SettingsDialogProps) {
  const isPixel = uiStyle === "pixel"

  const providerList: Array<{ key: Provider | "huggingface"; hasKey: boolean; name: string; description: string }> = [
    { key: "openai", hasKey: Boolean(apiKeys.openai), name: "OpenAI", description: "For GPT models and image generation" },
    { key: "claude", hasKey: Boolean(apiKeys.claude), name: "Claude", description: "For Anthropic's Claude models" },
    { key: "huggingface", hasKey: Boolean(apiKeys.huggingface), name: "Hugging Face", description: "For image generation models" },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "w-[90vw] max-w-lg border px-5 py-6 sm:px-6",
          isPixel
            ? "pixel-border pixel-surface pixel-shadow border-slate-500 bg-slate-200 dark:border-slate-600 dark:bg-slate-900"
            : "rounded-2xl border-white/40 bg-white/90 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/90",
        )}
      >
        <DialogHeader>
          <DialogTitle className={cn("text-lg font-semibold text-slate-900 dark:text-slate-100", isPixel && "pixel-font text-base")}>
            API Keys Settings
          </DialogTitle>
          <DialogDescription className={cn("text-sm text-slate-500 dark:text-slate-400", isPixel && "pixel-font text-xs")}>
            Manage your API keys for different AI providers.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Alert className={cn(
            isPixel
              ? "pixel-border border-slate-400 bg-slate-100 dark:border-slate-500 dark:bg-slate-800"
              : "border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-800/50"
          )}>
            <Info className="h-4 w-4 text-slate-600 dark:text-slate-400" />
            <AlertDescription className={cn("text-xs text-slate-600 dark:text-slate-400", isPixel && "pixel-font")}>
              <strong>Privacy Note:</strong> API keys are stored in your browser's local storage and never sent to our servers. They remain on your device.
            </AlertDescription>
          </Alert>

          <div className="space-y-3">
            <h3 className={cn(
              "text-xs font-medium uppercase tracking-[0.3em] text-slate-500",
              isPixel && "pixel-font text-[11px]"
            )}>
              Configured Providers
            </h3>

            <div className="space-y-2">
              {providerList.map(({ key, hasKey, name, description }) => {
                return (
                  <div
                    key={key}
                    className={cn(
                      "flex items-center justify-between rounded-lg border p-3",
                      isPixel
                        ? "pixel-border border-slate-400 bg-slate-100 dark:border-slate-500 dark:bg-slate-800"
                        : "border-white/40 bg-white/70 backdrop-blur dark:border-white/10 dark:bg-slate-900/60"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "flex h-9 w-9 items-center justify-center rounded-lg",
                          isPixel
                            ? "pixel-icon border-slate-500 bg-slate-200 dark:border-slate-600 dark:bg-slate-700"
                            : "border border-white/40 bg-white/90 dark:border-white/10 dark:bg-slate-900/60"
                        )}
                      >
                        <Key className="h-4 w-4 text-slate-700 dark:text-slate-300" />
                      </div>
                      <div>
                        <p className={cn(
                          "font-medium text-slate-900 dark:text-slate-100",
                          isPixel && "pixel-font text-sm"
                        )}>
                          {name}
                        </p>
                        <p className={cn(
                          "text-xs text-slate-500 dark:text-slate-400",
                          isPixel && "pixel-font text-[10px]"
                        )}>
                          {hasKey ? "API key configured" : description}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge
                        variant={hasKey ? "default" : "secondary"}
                        className={cn(
                          "gap-1 text-xs",
                          isPixel && "pixel-badge",
                          hasKey
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                        )}
                      >
                        {hasKey ? (
                          <>
                            <Check className="h-3 w-3" />
                            Active
                          </>
                        ) : (
                          <>
                            <X className="h-3 w-3" />
                            Inactive
                          </>
                        )}
                      </Badge>

                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          onManageProvider(key)
                          onOpenChange(false)
                        }}
                        className={cn(
                          "h-8 text-xs",
                          isPixel
                            ? "pixel-border pixel-shadow border-cyan-400 bg-cyan-500 text-white hover:bg-cyan-600"
                            : "rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:opacity-90"
                        )}
                      >
                        {hasKey ? "Manage" : "Add Key"}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
