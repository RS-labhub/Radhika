export type ImageProviderId = "pollinations_free" | "huggingface" | "free_alternatives" | "openai" // | "gemini"

export interface ImageGenerationModel {
  id: string
  label: string
}

export interface ImageGenerationSize {
  id: string
  label: string
  width: number
  height: number
}

export interface ImageGenerationProvider {
  id: ImageProviderId
  name: string
  requiresKey: boolean
  sizes: ImageGenerationSize[]
  models?: ImageGenerationModel[]
  defaultModel?: string
}

export type ImageStyleOption =
  | "none"
  | "ghibli"
  | "amigurumi"
  | "cartoon"
  | "realistic"
  | "minimalist"
  | "cyberpunk"
  | "watercolor"
  | "pixel_art"
  | "custom"

export interface ImageSettings {
  provider: ImageProviderId
  model?: string
  size: string
  customWidth?: number
  customHeight?: number
  style: ImageStyleOption
  customStyle?: string
  customPrompt: string
}
