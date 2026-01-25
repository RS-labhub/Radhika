import type { ImageProviderId, ImageSettings } from "@/types/image"
import { IMAGE_PROVIDERS, DEFAULT_IMAGE_PROVIDER } from "@/lib/image-providers"

// Create default image settings for a provider
export const createDefaultImageSettings = (providerId: ImageProviderId = DEFAULT_IMAGE_PROVIDER): ImageSettings => {
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

// Sanitize and validate image settings
export const sanitizeImageSettings = (raw: Partial<ImageSettings> | null | undefined): ImageSettings => {
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
