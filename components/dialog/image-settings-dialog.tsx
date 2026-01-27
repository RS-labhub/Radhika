"use client"

import { useEffect, useMemo, useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { IMAGE_PROVIDERS } from "@/lib/image-providers"
import type { ImageProviderId, ImageSettings, ImageStyleOption } from "@/types/image"
import type { UIStyle } from "@/types/chat"
import { Info } from "lucide-react"

interface ImageSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: ImageSettings
  onSave: (settings: ImageSettings) => void
  uiStyle: UIStyle
  providerKeyStatus: Record<ImageProviderId, boolean>
  onRequestProviderKey: (provider: ImageProviderId) => void
}

const STYLE_OPTIONS: Array<{ value: ImageStyleOption; label: string }> = [
  { value: "none", label: "No preset" },
  { value: "ghibli", label: "Studio Ghibli" },
  { value: "amigurumi", label: "Amigurumi" },
  { value: "cartoon", label: "Cartoon" },
  { value: "realistic", label: "Photorealistic" },
  { value: "minimalist", label: "Minimalist" },
  { value: "cyberpunk", label: "Cyberpunk" },
  { value: "watercolor", label: "Watercolor" },
  { value: "pixel_art", label: "Pixel Art" },
  { value: "custom", label: "Custom" },
]

export function ImageSettingsDialog({
  open,
  onOpenChange,
  settings,
  onSave,
  uiStyle,
  providerKeyStatus,
  onRequestProviderKey,
}: ImageSettingsDialogProps) {
  const [localSettings, setLocalSettings] = useState<ImageSettings>(settings)
  const [customWidth, setCustomWidth] = useState<string>(settings.customWidth ? String(settings.customWidth) : "")
  const [customHeight, setCustomHeight] = useState<string>(settings.customHeight ? String(settings.customHeight) : "")
  const [error, setError] = useState<string | null>(null)

  const isPixel = uiStyle === "pixel"

  useEffect(() => {
    if (!open) return
    setLocalSettings({ ...settings })
    setCustomWidth(settings.customWidth ? String(settings.customWidth) : "")
    setCustomHeight(settings.customHeight ? String(settings.customHeight) : "")
    setError(null)
  }, [open, settings])

  const currentProvider = useMemo(() => IMAGE_PROVIDERS[localSettings.provider], [localSettings.provider])
  const providerRequiresKey = currentProvider.requiresKey
  const providerHasKey = providerKeyStatus[currentProvider.id] ?? false

  const providerModelOptions = currentProvider.models ?? []
  const providerSizeOptions = currentProvider.sizes

  const labelClass = cn(
    "text-xs font-medium uppercase text-slate-500 tracking-[0.2em] sm:tracking-[0.3em]",
    isPixel && "pixel-font text-[11px]",
  )

  const handleProviderChange = (nextProvider: ImageProviderId) => {
    const providerMeta = IMAGE_PROVIDERS[nextProvider]
    const firstSize = providerMeta.sizes[0]
    const defaultModel = providerMeta.defaultModel ?? providerMeta.models?.[0]?.id

    setLocalSettings((prev) => ({
      ...prev,
      provider: nextProvider,
      model: defaultModel,
      size: firstSize ? firstSize.id : "custom",
      customWidth: firstSize?.width,
      customHeight: firstSize?.height,
    }))
    setCustomWidth(firstSize ? String(firstSize.width) : "")
    setCustomHeight(firstSize ? String(firstSize.height) : "")
  }

  const handleModelChange = (nextModel: string) => {
    setLocalSettings((prev) => ({
      ...prev,
      model: nextModel,
    }))
  }

  const handleSizeChange = (nextSize: string) => {
    const predefined = providerSizeOptions.find((option) => option.id === nextSize)

    setLocalSettings((prev) => ({
      ...prev,
      size: nextSize,
      customWidth: predefined?.width ?? prev.customWidth,
      customHeight: predefined?.height ?? prev.customHeight,
    }))

    if (predefined) {
      setCustomWidth(String(predefined.width))
      setCustomHeight(String(predefined.height))
    }
  }

  const handleCustomDimensionChange = (axis: "width" | "height", value: string) => {
    const numeric = value ? Number(value) : NaN

    if (axis === "width") {
      setCustomWidth(value)
      setLocalSettings((prev) => ({
        ...prev,
        customWidth: Number.isFinite(numeric) ? numeric : prev.customWidth,
      }))
    } else {
      setCustomHeight(value)
      setLocalSettings((prev) => ({
        ...prev,
        customHeight: Number.isFinite(numeric) ? numeric : prev.customHeight,
      }))
    }
  }

  const handleStyleChange = (nextStyle: ImageStyleOption) => {
    setLocalSettings((prev) => ({
      ...prev,
      style: nextStyle,
    }))
  }

  const handleCustomStyleChange = (value: string) => {
    setLocalSettings((prev) => ({
      ...prev,
      customStyle: value,
    }))
  }

  const handlePromptChange = (value: string) => {
    setLocalSettings((prev) => ({
      ...prev,
      customPrompt: value,
    }))
  }

  const handleSave = () => {
    setError(null)

    if (localSettings.size === "custom") {
      const widthValue = Number(customWidth)
      const heightValue = Number(customHeight)

      if (!Number.isFinite(widthValue) || !Number.isFinite(heightValue)) {
        setError("Custom dimensions must be valid numbers.")
        return
      }

      if (widthValue < 64 || widthValue > 2048 || heightValue < 64 || heightValue > 2048) {
        setError("Custom dimensions must be between 64 and 2048 pixels.")
        return
      }

      onSave({
        ...localSettings,
        customWidth: widthValue,
        customHeight: heightValue,
      })
      onOpenChange(false)
      return
    }

    const selectedPreset = providerSizeOptions.find((option) => option.id === localSettings.size)

    onSave({
      ...localSettings,
      customWidth: selectedPreset?.width ?? localSettings.customWidth,
      customHeight: selectedPreset?.height ?? localSettings.customHeight,
    })
    onOpenChange(false)
  }

  const needsApiKeyWarning = providerRequiresKey && !providerHasKey

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[90vh] w-[95vw] max-w-2xl flex-col overflow-hidden border px-3 py-4 sm:px-6 sm:py-5",
          isPixel
            ? "pixel-border pixel-surface pixel-shadow border-slate-500 bg-slate-200 dark:border-slate-600 dark:bg-slate-900"
            : "rounded-2xl border-white/40 bg-white/90 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/90",
        )}
      >
        <DialogHeader>
          <DialogTitle className={cn("text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100", isPixel && "pixel-font text-base sm:text-base")}>Image generation</DialogTitle>
          <DialogDescription className={cn("text-xs sm:text-sm text-slate-500 dark:text-slate-400", isPixel && "pixel-font text-[10px] sm:text-xs")}>
            Choose a provider, size, and style for generated images. Your chat message is used as the base prompt unless you override it here.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 sm:space-y-5 overflow-y-auto py-3 sm:py-4 sm:max-h-[70vh]">
          <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className={labelClass}>Provider</Label>
              <Select value={currentProvider.id} onValueChange={(value) => handleProviderChange(value as ImageProviderId)}>
                <SelectTrigger
                  className={cn(
                    isPixel
                      ? "pixel-border pixel-shadow border-slate-500 bg-slate-100 text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                      : "rounded-xl border-white/40 bg-white/70 backdrop-blur text-slate-700 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200",
                  )}
                >
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent
                  className={cn(
                    "max-h-[55vh] overflow-y-auto border bg-white/95 text-slate-700 dark:bg-slate-900/95 dark:text-slate-100",
                    isPixel && "pixel-border pixel-shadow border-slate-500 bg-slate-200 dark:border-slate-600 dark:bg-slate-900",
                  )}
                >
                  {Object.values(IMAGE_PROVIDERS).map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      {provider.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {providerModelOptions.length > 0 && (
              <div className="space-y-2">
                <Label className={labelClass}>Model</Label>
                <Select value={localSettings.model ?? providerModelOptions[0]?.id ?? ""} onValueChange={handleModelChange}>
                  <SelectTrigger
                    className={cn(
                      isPixel
                        ? "pixel-border pixel-shadow border-slate-500 bg-slate-100 text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                        : "rounded-xl border-white/40 bg-white/70 backdrop-blur text-slate-700 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200",
                    )}
                  >
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent
                    className={cn(
                      "max-h-[55vh] overflow-y-auto border bg-white/95 text-slate-700 dark:bg-slate-900/95 dark:text-slate-100",
                      isPixel && "pixel-border pixel-shadow border-slate-500 bg-slate-200 dark:border-slate-600 dark:bg-slate-900",
                    )}
                  >
                    {providerModelOptions.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className={labelClass}>Size</Label>
              <Select value={localSettings.size} onValueChange={handleSizeChange}>
                <SelectTrigger
                  className={cn(
                    isPixel
                      ? "pixel-border pixel-shadow border-slate-500 bg-slate-100 text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                      : "rounded-xl border-white/40 bg-white/70 backdrop-blur text-slate-700 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200",
                  )}
                >
                  <SelectValue placeholder="Select size" />
                </SelectTrigger>
                <SelectContent
                  className={cn(
                    "max-h-[55vh] overflow-y-auto border bg-white/95 text-slate-700 dark:bg-slate-900/95 dark:text-slate-100",
                    isPixel && "pixel-border pixel-shadow border-slate-500 bg-slate-200 dark:border-slate-600 dark:bg-slate-900",
                  )}
                >
                  {providerSizeOptions.map((size) => (
                    <SelectItem key={size.id} value={size.id}>
                      {size.label}
                    </SelectItem>
                  ))}
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {localSettings.size === "custom" && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className={labelClass}>Width</Label>
                  <Input
                    type="number"
                    min={64}
                    max={2048}
                    value={customWidth}
                    onChange={(event) => handleCustomDimensionChange("width", event.target.value)}
                    className={cn(
                      isPixel
                        ? "pixel-border border-slate-500 bg-slate-100 text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                        : "rounded-xl border-white/40 bg-white/70 backdrop-blur text-slate-700 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200",
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <Label className={labelClass}>Height</Label>
                  <Input
                    type="number"
                    min={64}
                    max={2048}
                    value={customHeight}
                    onChange={(event) => handleCustomDimensionChange("height", event.target.value)}
                    className={cn(
                      isPixel
                        ? "pixel-border border-slate-500 bg-slate-100 text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                        : "rounded-xl border-white/40 bg-white/70 backdrop-blur text-slate-700 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200",
                    )}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className={labelClass}>Style preset</Label>
              <Select value={localSettings.style} onValueChange={(value) => handleStyleChange(value as ImageStyleOption)}>
                <SelectTrigger
                  className={cn(
                    isPixel
                      ? "pixel-border pixel-shadow border-slate-500 bg-slate-100 text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                      : "rounded-xl border-white/40 bg-white/70 backdrop-blur text-slate-700 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200",
                  )}
                >
                  <SelectValue placeholder="Choose style" />
                </SelectTrigger>
                <SelectContent
                  className={cn(
                    "max-h-[55vh] overflow-y-auto border bg-white/95 text-slate-700 dark:bg-slate-900/95 dark:text-slate-100",
                    isPixel && "pixel-border pixel-shadow border-slate-500 bg-slate-200 dark:border-slate-600 dark:bg-slate-900",
                  )}
                >
                  {STYLE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {localSettings.style === "custom" && (
              <div className="space-y-2">
                <Label className={labelClass}>Custom style prompt</Label>
                <Input
                  value={localSettings.customStyle ?? ""}
                  onChange={(event) => handleCustomStyleChange(event.target.value)}
                  placeholder="Describe the art direction"
                  className={cn(
                    isPixel
                      ? "pixel-border border-slate-500 bg-slate-100 text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                      : "rounded-xl border-white/40 bg-white/70 backdrop-blur text-slate-700 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200",
                  )}
                />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label className={labelClass}>Prompt override</Label>
            <Textarea
              value={localSettings.customPrompt}
              onChange={(event) => handlePromptChange(event.target.value)}
              placeholder="Optional. Leave blank to use your chat message."
              className={cn(
                "min-h-[100px]",
                isPixel
                  ? "pixel-border border-slate-500 bg-slate-100 text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  : "rounded-2xl border-white/40 bg-white/70 backdrop-blur text-slate-700 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200",
              )}
            />
          </div>

          {needsApiKeyWarning && (
            <Alert
              className={cn(
                isPixel
                  ? "pixel-border border-amber-400 bg-amber-100 text-amber-800 dark:border-amber-500 dark:bg-amber-900/30 dark:text-amber-200"
                  : "flex items-start gap-3 border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-200",
              )}
            >
              <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <AlertDescription className={cn("text-xs", isPixel && "pixel-font text-[11px]")}>
                This provider needs an API key before images can be generated.
                <Button
                  type="button"
                  variant="link"
                  className={cn(
                    "ml-1 px-0 text-xs",
                    isPixel
                      ? "pixel-font text-cyan-700 underline underline-offset-4 dark:text-cyan-300"
                      : "text-cyan-600 underline underline-offset-4 dark:text-cyan-300",
                  )}
                  onClick={() => onRequestProviderKey(currentProvider.id)}
                >
                  Connect API key
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert
              className={cn(
                isPixel
                  ? "pixel-border border-rose-400 bg-rose-100 text-rose-800 dark:border-rose-500 dark:bg-rose-900/30 dark:text-rose-200"
                  : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-950/30 dark:text-rose-200",
              )}
            >
              <Info className="h-4 w-4" />
              <AlertDescription className={cn("text-xs", isPixel && "pixel-font text-[11px]")}>
                {error}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="flex-row gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className={cn(
              "h-9 sm:h-10 px-3 sm:px-4 flex-1 sm:flex-none text-sm",
              isPixel
                ? "pixel-border pixel-shadow border-slate-500 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                : "rounded-xl border-white/40 bg-white/70 text-slate-600 hover:bg-white/80 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200",
            )}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            className={cn(
              "h-9 sm:h-10 px-4 sm:px-6 flex-[2] sm:flex-1 text-sm",
              isPixel
                ? "pixel-border pixel-shadow border-cyan-400 bg-cyan-500 text-white hover:bg-cyan-600"
                : "rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg hover:opacity-90",
            )}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
