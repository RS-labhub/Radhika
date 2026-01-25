import type { ImageGenerationProvider, ImageProviderId } from "@/types/image"

export const IMAGE_PROVIDERS: Record<ImageProviderId, ImageGenerationProvider> = {
  pollinations_free: {
    id: "pollinations_free",
    name: "AI Image Generator (Pollinations)",
    requiresKey: false,
    models: [
      { id: "flux", label: "Flux Schnell (Fast & Free)" },
      { id: "zimage", label: "Z-Image Turbo (Realistic)" },
      { id: "turbo", label: "SDXL Turbo (Fast)" },
      { id: "klein", label: "FLUX.2 Klein 4B (NEW)" },
      { id: "gptimage", label: "GPT Image 1 Mini" },
    ],
    defaultModel: "flux",
    sizes: [
      { id: "post", label: "X/Twitter Post (1200x675)", width: 1200, height: 675 },
      { id: "square_small", label: "Square (512x512)", width: 512, height: 512 },
      { id: "square_medium", label: "Square (768x768)", width: 768, height: 768 },
      { id: "square_large", label: "Square (1024x1024)", width: 1024, height: 1024 },
      { id: "best_square", label: "Best Square (1536x1536)", width: 1536, height: 1536 },
      { id: "portrait", label: "Portrait (512x768)", width: 512, height: 768 },
      { id: "landscape", label: "Landscape (768x512)", width: 768, height: 512 },
      { id: "landscape_wide", label: "Wide (1024x576)", width: 1024, height: 576 },
      { id: "hd_landscape", label: "HD Landscape (1536x864)", width: 1536, height: 864 },
    ],
  },
  huggingface: {
    id: "huggingface",
    name: "Hugging Face Models",
    requiresKey: true,
    models: [
      { id: "black-forest-labs/FLUX.1-schnell", label: "FLUX.1 Schnell (Fast & High Quality)" },
      { id: "stabilityai/stable-diffusion-xl-base-1.0", label: "SDXL Base 1.0 (High Quality)" },
    ],
    defaultModel: "black-forest-labs/FLUX.1-schnell",
    sizes: [
      { id: "square_small", label: "Square (512x512)", width: 512, height: 512 },
      { id: "portrait", label: "Portrait (512x768)", width: 512, height: 768 },
      { id: "landscape", label: "Landscape (768x512)", width: 768, height: 512 },
      { id: "square_large", label: "HD Square (1024x1024)", width: 1024, height: 1024 },
      { id: "best_square", label: "Best Square (1536x1536)", width: 1536, height: 1536 },
    ],
  },
  free_alternatives: {
    id: "free_alternatives",
    name: "Free Alternative Services",
    requiresKey: false,
    models: [
      { id: "flux", label: "FLUX (High Quality)" },
      { id: "sdxl", label: "SDXL (Stable Diffusion XL)" },
      { id: "playground", label: "Playground AI (Creative)" },
      { id: "craiyon", label: "Craiyon (DALL-E Mini)" },
    ],
    defaultModel: "flux",
    sizes: [
      { id: "post", label: "Post (1200x675)", width: 1200, height: 675 },
      { id: "square_small", label: "Square (512x512)", width: 512, height: 512 },
      { id: "square_medium", label: "Square (768x768)", width: 768, height: 768 },
      { id: "square_large", label: "Square (1024x1024)", width: 1024, height: 1024 },
      { id: "portrait", label: "Portrait (512x768)", width: 512, height: 768 },
      { id: "landscape", label: "Landscape (768x512)", width: 768, height: 512 },
    ],
  },
  openai: {
    id: "openai",
    name: "OpenAI DALL-E",
    requiresKey: true,
    models: [{ id: "dall-e-3", label: "DALL-E 3" }],
    defaultModel: "dall-e-3",
    sizes: [
      { id: "square_large", label: "Square HD (1024x1024)", width: 1024, height: 1024 },
      { id: "hd_portrait", label: "HD Portrait (1024x1792)", width: 1024, height: 1792 },
      { id: "hd_landscape", label: "HD Landscape (1792x1024)", width: 1792, height: 1024 },
      { id: "highest_resolution", label: "Highest Resolution (1792x1024)", width: 1792, height: 1024 },
    ],
  },
  // gemini: {
  //   id: "gemini",
  //   name: "Google Gemini (Free)",
  //   requiresKey: false,
  //   models: [
  //     { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  //   ],
  //   defaultModel: "gemini-2.5-flash",
  //   sizes: [
  //     { id: "square_small", label: "Square (512x512)", width: 512, height: 512 },
  //     { id: "square_medium", label: "Square (768x768)", width: 768, height: 768 },
  //     { id: "square_large", label: "Square HD (1024x1024)", width: 1024, height: 1024 },
  //     { id: "portrait", label: "Portrait (512x768)", width: 512, height: 768 },
  //     { id: "landscape", label: "Landscape (768x512)", width: 768, height: 512 },
  //     { id: "landscape_wide", label: "Wide (1024x576)", width: 1024, height: 576 },
  //   ],
  // },
}

export const DEFAULT_IMAGE_PROVIDER: ImageProviderId = "pollinations_free"
