"use client"

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { cn } from "@/lib/utils"
import type { KeyProvider, KeyProviderMetadata, UIStyle } from "@/types/chat"
import type { ChangeEvent } from "react"
import { Info } from "lucide-react"

interface ApiKeyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  provider: KeyProvider
  providerMeta: KeyProviderMetadata
  tempApiKey: string
  onTempApiKeyChange: (event: ChangeEvent<HTMLInputElement>) => void
  onSave: () => void
  onRemove?: () => void
  hasExistingKey?: boolean
  uiStyle: UIStyle
}

export function ApiKeyDialog({ open, onOpenChange, provider, providerMeta, tempApiKey, onTempApiKeyChange, onSave, onRemove, hasExistingKey, uiStyle }: ApiKeyDialogProps) {
  const isPixel = uiStyle === "pixel"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "w-[90vw] max-w-md border px-5 py-6 sm:px-6",
          isPixel
            ? "pixel-border pixel-surface pixel-shadow border-slate-500 bg-slate-200 dark:border-slate-600 dark:bg-slate-900"
            : "rounded-2xl border-white/40 bg-white/90 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/90",
        )}
      >
        <DialogHeader>
          <DialogTitle className={cn("text-lg font-semibold text-slate-900 dark:text-slate-100", isPixel && "pixel-font text-base")}>
            {hasExistingKey ? `Manage ${providerMeta.name} API Key` : `Connect ${providerMeta.name}`}
          </DialogTitle>
          <DialogDescription className={cn("text-sm text-slate-500 dark:text-slate-400", isPixel && "pixel-font text-xs")}>
            {hasExistingKey ? `Update or remove your ${providerMeta.name} API key.` : `Enter your ${providerMeta.name} API key to unlock this provider.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-4">
          {hasExistingKey && (
            <Alert className={cn(
              "mb-2",
              isPixel
                ? "pixel-border border-cyan-400 bg-cyan-100/70 dark:bg-cyan-900/30"
                : "border-cyan-200 bg-cyan-50/70 dark:border-cyan-500/40 dark:bg-cyan-900/30"
            )}>
              <Info className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
              <AlertDescription className={cn("text-xs text-cyan-700 dark:text-cyan-300", isPixel && "pixel-font")}>
                You already have an API key set for this provider. Enter a new key to replace it or remove the existing one.
              </AlertDescription>
            </Alert>
          )}
          <label htmlFor="api-key" className={cn("text-xs font-medium uppercase tracking-[0.3em] text-slate-500", isPixel && "pixel-font text-[11px]")}>API Key</label>
          <Input
            id="api-key"
            type="password"
            autoComplete="off"
            value={tempApiKey}
            onChange={onTempApiKeyChange}
            placeholder={hasExistingKey ? "Enter new API key (optional)" : `Enter your ${providerMeta.name} API key`}
            className={cn(
              "text-sm text-slate-900 focus-visible:ring-0 dark:text-slate-100",
              isPixel
                ? "pixel-border pixel-shadow border-slate-500 bg-slate-100 dark:border-slate-600 dark:bg-slate-900"
                : "rounded-xl border-white/40 bg-white/70 backdrop-blur focus-visible:border-cyan-400 dark:border-white/10 dark:bg-slate-900/60",
            )}
          />
          <Alert className={cn(
            isPixel
              ? "pixel-border border-slate-400 bg-slate-100 dark:border-slate-500 dark:bg-slate-800"
              : "border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-800/50"
          )}>
            <Info className="h-4 w-4 text-slate-600 dark:text-slate-400" />
            <AlertDescription className={cn("text-xs text-slate-600 dark:text-slate-400", isPixel && "pixel-font")}>
              <strong>Note:</strong> API keys are stored in your browser's local storage and never sent to our servers. They remain on your device.
            </AlertDescription>
          </Alert>
        </div>
        <DialogFooter className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className={cn(
              "w-full justify-center border px-4 py-2 text-sm font-medium sm:w-auto",
              isPixel
                ? "pixel-border pixel-shadow border-slate-500 bg-slate-200 text-slate-800 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                : "rounded-xl border-white/40 bg-white/70 hover:bg-white/90 dark:border-white/10 dark:bg-slate-900/60",
            )}
          >
            Cancel
          </Button>
          {hasExistingKey && onRemove && (
            <Button
              type="button"
              variant="destructive"
              onClick={onRemove}
              className={cn(
                "w-full justify-center px-4 py-2 text-sm font-medium sm:w-auto",
                isPixel
                  ? "pixel-border pixel-shadow border-rose-400 bg-rose-500 text-white hover:bg-rose-600"
                  : "rounded-xl bg-gradient-to-r from-rose-500 to-red-500 text-white shadow-lg hover:opacity-90",
              )}
            >
              Remove Key
            </Button>
          )}
          <Button
            type="button"
            onClick={onSave}
            disabled={tempApiKey.trim().length === 0}
            className={cn(
              "w-full justify-center px-4 py-2 text-sm font-semibold sm:w-auto",
              isPixel
                ? "pixel-border pixel-shadow border-cyan-400 bg-cyan-500 text-white hover:bg-cyan-600"
                : "rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg hover:opacity-90",
              tempApiKey.trim().length === 0 && "opacity-50",
            )}
          >
            {hasExistingKey ? "Update Key" : "Save & Activate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
