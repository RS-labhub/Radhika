import { Buffer } from "node:buffer"
import { NextRequest, NextResponse } from "next/server"

interface ImageGenerationSize {
  id: string
  label: string
  width: number
  height: number
}

interface ImageGenerationModel {
  id: string
  label: string
}

interface ImageGenerationProvider {
  id: string
  name: string
  requiresKey: boolean
  sizes: ImageGenerationSize[]
  models?: ImageGenerationModel[]
  defaultModel?: string
}

const IMAGE_PROVIDERS: Record<string, ImageGenerationProvider> = {
  pollinations_free: {
    id: "pollinations_free",
    name: "AI Image Generator (Free)",
    requiresKey: false,
    models: [
      { id: "turbo", label: "Turbo (Fast Generation)" },
      { id: "sdxl", label: "Higher Quality (SDXL, Slower)" },
    ],
    defaultModel: "turbo",
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
  gemini: {
    id: "gemini",
    name: "Google Gemini (Free)",
    requiresKey: false,
    models: [
      { id: "gemini-2.5-flash-image", label: "Gemini 2.5 Flash (Fast & Free)" },
    ],
    defaultModel: "gemini-2.5-flash-image",
    sizes: [
      { id: "square_small", label: "Square (512x512)", width: 512, height: 512 },
      { id: "square_medium", label: "Square (768x768)", width: 768, height: 768 },
      { id: "square_large", label: "Square HD (1024x1024)", width: 1024, height: 1024 },
      { id: "portrait", label: "Portrait (512x768)", width: 512, height: 768 },
      { id: "landscape", label: "Landscape (768x512)", width: 768, height: 512 },
      { id: "landscape_wide", label: "Wide (1024x576)", width: 1024, height: 576 },
    ],
  },
}

async function generateFreeAlternatives(
  prompt: string,
  model: string,
  width: number,
  height: number,
): Promise<{ imageUrl: string; credits: number; model: string }> {
  const chosenModel = model || "flux"

  const services = [
    {
      name: "Pollinations AI",
      generateUrl: () => {
        const encodedPrompt = encodeURIComponent(prompt)
        const seed = Math.floor(Math.random() * 1_000_000)
        const pollinationModel =
          chosenModel === "flux" ? "flux" : chosenModel === "sdxl" ? "dreamshaper" : "turbo"
        return `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${seed}&nologo=true&model=${pollinationModel}&enhance=true`
      },
      isDirect: true,
    },
    {
      name: "ImgGen AI",
      generateUrl: () => {
        const encodedPrompt = encodeURIComponent(prompt)
        return `https://api.limewire.com/api/image/generation?prompt=${encodedPrompt}&aspect_ratio=${width}:${height}`
      },
      isDirect: true,
      requiresPost: true,
    },
    {
      name: "Replicate Flux Schnell",
      generateUrl: () => {
        const encodedPrompt = encodeURIComponent(prompt)
        return `https://fal.ai/api/v1/run/fal-ai/flux/schnell?prompt=${encodedPrompt}&image_size=${width}x${height}`
      },
      isDirect: true,
      isBackup: true,
    },
  ] as const

  for (const service of services) {
    try {
      console.log(`Trying ${service.name} with model: ${chosenModel}...`)

  const requiresPost = "requiresPost" in service && Boolean(service.requiresPost)
  if (service.isDirect && !requiresPost) {
        const url = service.generateUrl()
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Request timeout")), 30_000),
        )

        const fetchPromise = fetch(url, {
          method: "GET",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept: "image/*,*/*",
            Referer: "https://pollinations.ai/",
          },
        })

        const response = (await Promise.race([fetchPromise, timeoutPromise])) as Response

        if (!response.ok) {
          console.error(`${service.name} error: ${response.status} ${response.statusText}`)
          continue
        }

        const contentType = response.headers.get("content-type")
        if (!contentType || !contentType.startsWith("image/")) {
          console.error(`${service.name} returned non-image content: ${contentType}`)
          continue
        }

        const contentLength = response.headers.get("content-length")
        if (contentLength && Number.parseInt(contentLength, 10) < 1000) {
          console.error(`${service.name} returned suspiciously small image: ${contentLength} bytes`)
          continue
        }

        return {
          imageUrl: url,
          credits: 0,
          model: chosenModel,
        }
      }
    } catch (error) {
      console.error(`${service.name} failed:`, error)
      continue
    }
  }

  throw new Error(
    "All free alternative image generation services are currently unavailable. Please try again later or use a different provider.",
  )
}

async function generateFreeImage(
  prompt: string,
  model: string,
  width: number,
  height: number,
): Promise<{ imageUrl: string; credits: number; model: string }> {
  const chosenModel = model || "turbo"

  const modelMapping: Record<string, string> = {
    turbo: "turbo",
    sdxl: "dreamshaper",
  }

  const pollinationModel = modelMapping[chosenModel] || "turbo"

  const services = [
    {
      name: "Pollinations AI",
      generateUrl: () => {
        const encodedPrompt = encodeURIComponent(prompt)
        const seed = Math.floor(Math.random() * 1_000_000)
        return `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${seed}&nologo=true&model=${pollinationModel}&enhance=true&safe=true`
      },
      isDirect: true,
    },
    {
      name: "Pollinations AI (Backup)",
      generateUrl: () => {
        const encodedPrompt = encodeURIComponent(prompt)
        const seed = Math.floor(Math.random() * 1_000_000)
        return `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${seed}&nologo=true`
      },
      isDirect: true,
    },
  ] as const

  for (const service of services) {
    try {
      console.log(`Trying ${service.name} with model: ${chosenModel} (mapped to: ${pollinationModel})...`)

      if (service.isDirect) {
        const url = service.generateUrl()
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Request timeout")), 45_000),
        )

        const fetchPromise = fetch(url, {
          method: "GET",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept: "image/*,*/*",
            Referer: "https://pollinations.ai/",
            "Cache-Control": "no-cache",
          },
        })

        const response = (await Promise.race([fetchPromise, timeoutPromise])) as Response

        if (!response.ok) {
          console.error(`${service.name} error: ${response.status} ${response.statusText}`)
          continue
        }

        const contentType = response.headers.get("content-type")
        if (!contentType || !contentType.startsWith("image/")) {
          console.error(`${service.name} returned non-image content: ${contentType}`)
          continue
        }

        const contentLength = response.headers.get("content-length")
        if (contentLength && Number.parseInt(contentLength, 10) < 1000) {
          console.error(`${service.name} returned suspiciously small image: ${contentLength} bytes`)
          continue
        }

        return {
          imageUrl: url,
          credits: 0,
          model: chosenModel,
        }
      }
    } catch (error) {
      console.error(`${service.name} failed:`, error)
      continue
    }
  }

  console.warn("All free image generation services failed")
  throw new Error(
    "All free image generation services are currently unavailable. Please try again later or use a different provider.",
  )
}

async function generateHuggingFaceImage(
  prompt: string,
  apiKey: string,
  model: string,
  size: { width: number; height: number },
): Promise<{ imageUrl: string; credits: number; model: string }> {
  try {
    const isFluxModel = model.includes("FLUX")
    const isSDXLModel = model.includes("xl") || model.includes("SDXL")

    const requestBody: Record<string, unknown> = {
      inputs: prompt,
    }

    if (isFluxModel) {
      requestBody.parameters = {
        width: Math.min(size.width, 1024),
        height: Math.min(size.height, 1024),
        guidance_scale: 3.5,
        num_inference_steps: 4,
        max_sequence_length: 256,
      }
    } else if (isSDXLModel) {
      requestBody.parameters = {
        width: size.width,
        height: size.height,
        guidance_scale: 7.5,
        num_inference_steps: 20,
      }
    } else {
      requestBody.parameters = {
        width: Math.min(size.width, 512),
        height: Math.min(size.height, 512),
        guidance_scale: 7.5,
        num_inference_steps: 50,
      }
    }

    console.log(`Generating image with Hugging Face model: ${model}`)

    const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Wait-For-Model": "true",
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("Hugging Face API error:", errorText)

      if (response.status === 503) {
        throw new Error("Model is currently loading. Please try again in 20-30 seconds.")
      }
      if (response.status === 401) {
        throw new Error("Invalid Hugging Face API key. Please check your API key.")
      }
      if (response.status === 429) {
        throw new Error("Rate limit exceeded. Please try again later.")
      }
      if (response.status === 400) {
        throw new Error(
          "Invalid request parameters. The model might not support the requested size or parameters.",
        )
      }
      if (response.status === 404) {
        throw new Error(
          `Model "${model}" not found or no longer available. Please try a different model like "black-forest-labs/FLUX.1-schnell" or "stabilityai/stable-diffusion-xl-base-1.0".`,
        )
      }

      throw new Error(`Hugging Face API error: ${response.status} - ${errorText}`)
    }

    const contentType = response.headers.get("content-type") ?? ""

    if (contentType.includes("application/json")) {
      const errorData = await response.json()
      if (errorData.error) {
        throw new Error(`Hugging Face API error: ${errorData.error}`)
      }
    }

    const imageBlob = await response.blob()

    if (imageBlob.size === 0) {
      throw new Error("Received empty image from Hugging Face API")
    }

    const buffer = Buffer.from(await imageBlob.arrayBuffer())
    const base64Image = buffer.toString("base64")
    const mimeType = imageBlob.type || "image/jpeg"
    const dataUrl = `data:${mimeType};base64,${base64Image}`

    return {
      imageUrl: dataUrl,
      credits: 0,
      model: model.split("/").pop() || model,
    }
  } catch (error) {
    console.error("Hugging Face generation error:", error)
    throw error
  }
}

async function generateGeminiImage(
  prompt: string,
  model: string,
  width: number,
  height: number,
): Promise<{ imageUrl: string; credits: number; model: string }> {
  try {
    const geminiApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || ""
    
    if (!geminiApiKey) {
      throw new Error("Gemini API key not configured in environment variables")
    }

    // Use Gemini 2.5 Flash Image for image generation
    const imageModel = "gemini-2.5-flash-image"
    
    // Construct the prompt for image generation
    const imagePrompt = `Generate an image: ${prompt}. The image should be ${width}x${height} pixels.`
    
    console.log(`Generating image with Gemini ${imageModel}...`)
    
    // Gemini API endpoint for content generation
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${imageModel}:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: imagePrompt
            }]
          }],
          generationConfig: {
            temperature: 0.8,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 8192,
          },
        }),
      }
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorMessage = errorData.error?.message || response.statusText
      console.error(`Gemini API error (${response.status}):`, errorMessage)
      throw new Error(`Gemini API error: ${errorMessage}`)
    }

    const data = await response.json()
    
    // Check if there's image data in the response
    if (data.candidates?.[0]?.content?.parts?.[0]?.inlineData) {
      const imageData = data.candidates[0].content.parts[0].inlineData
      const mimeType = imageData.mimeType || "image/png"
      const base64Data = imageData.data
      
      const imageUrl = `data:${mimeType};base64,${base64Data}`
      
      return {
        imageUrl,
        credits: 0, // Free
        model: imageModel,
      }
    }
    
    // If no image data, Gemini might not support image generation directly
    // Fall back to text description error
    throw new Error("Gemini doesn't support direct image generation yet. Using Pollinations as fallback.")
    
  } catch (error) {
    console.error("Gemini image generation error:", error)
    throw error
  }
}

async function generateOpenAIImage(
  prompt: string,
  apiKey: string,
  model: string,
  size: string,
): Promise<{ imageUrl: string; credits: number; model: string }> {
  try {
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        prompt,
        n: 1,
        size,
        quality: model === "dall-e-3" ? "hd" : "standard",
        style: "vivid",
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`OpenAI API error: ${errorData.error?.message || "Unknown error"}`)
    }

    const data = await response.json()
    const imageUrl = data.data?.[0]?.url

    if (!imageUrl) {
      throw new Error("No image URL returned from OpenAI")
    }

    const credits = model === "dall-e-3" ? (size.includes("hd") ? 0.12 : 0.08) : 0.02

    return {
      imageUrl,
      credits,
      model,
    }
  } catch (error) {
    console.error("OpenAI image generation error:", error)
    throw error
  }
}

function generatePromptFromContent(
  content: string,
  title: string,
  customPrompt?: string,
  style?: string,
  customStyle?: string,
): string {
  let basePrompt = ""

  if (customPrompt) {
    basePrompt = customPrompt
  } else {
    const words = content.toLowerCase().split(/\s+/)
    const techKeywords = [
      "ai",
      "machine learning",
      "blockchain",
      "cloud",
      "devops",
      "programming",
      "software",
      "database",
      "api",
      "framework",
      "javascript",
      "python",
      "react",
      "node",
      "docker",
    ]

    const foundKeywords = techKeywords.filter((keyword) => words.some((word) => word.includes(keyword)))

    basePrompt = `Create a professional blog cover image for an article titled "${title}".`

    if (foundKeywords.length > 0) {
      basePrompt += ` The article focuses on ${foundKeywords.slice(0, 3).join(", ")}.`
    }

    basePrompt += " Modern, clean design with abstract tech elements. Professional color scheme."
  }

  if (style && style !== "none") {
    const stylePrompts: Record<string, string> = {
      ghibli: "in Studio Ghibli style, anime aesthetic, soft colors, dreamy atmosphere, hand-drawn animation style",
      amigurumi: "in amigurumi style, cute crochet doll aesthetic, soft yarn texture, adorable kawaii design",
      cartoon: "in cartoon style, vibrant colors, bold outlines, animated illustration style",
      realistic: "photorealistic, high detail, professional photography style, realistic lighting",
      minimalist: "minimalist style, clean design, simple composition, flat design aesthetic",
      cyberpunk: "cyberpunk style, neon colors, futuristic aesthetic, dark atmosphere with bright accents",
      watercolor: "watercolor painting style, soft brushstrokes, flowing colors, artistic aesthetic",
      pixel_art: "pixel art style, 8-bit aesthetic, retro game graphics, blocky pixels",
      custom: customStyle || "",
    }

    const stylePrompt = stylePrompts[style] || ""
    if (stylePrompt) {
      basePrompt += `, ${stylePrompt}`
    }
  }

  return basePrompt
}

export async function POST(req: NextRequest) {
  try {
    const {
      provider,
      prompt: customPrompt,
      content,
      title,
      size,
      customWidth,
      customHeight,
      model,
      apiKey: providedApiKey,
      style,
      customStyle,
    } = await req.json()

    const selectedProvider = IMAGE_PROVIDERS[provider]
    if (!selectedProvider) {
      return NextResponse.json({ error: "Invalid image provider" }, { status: 400 })
    }

    let selectedSize: { width: number; height: number }

    if (size === "custom" && customWidth && customHeight) {
      const width = Number.parseInt(customWidth.toString(), 10)
      const height = Number.parseInt(customHeight.toString(), 10)

      if (Number.isNaN(width) || Number.isNaN(height) || width < 64 || height < 64 || width > 2048 || height > 2048) {
        return NextResponse.json(
          { error: "Invalid custom dimensions. Width and height must be between 64 and 2048 pixels." },
          { status: 400 },
        )
      }

      selectedSize = { width, height }
    } else {
      const predefinedSize = selectedProvider.sizes.find((value) => value.id === size)
      if (!predefinedSize) {
        return NextResponse.json({ error: "Invalid image size" }, { status: 400 })
      }
      selectedSize = predefinedSize
    }

    const prompt = generatePromptFromContent(content || "", title || "", customPrompt, style, customStyle)

    let result: { imageUrl: string; credits: number; model: string }

    if (provider === "pollinations_free") {
      const selectedModel = model || selectedProvider.defaultModel
      console.log(`Generating image with pollinations_free: ${selectedModel}, ${selectedSize.width}x${selectedSize.height}`)

      result = await generateFreeImage(prompt, selectedModel!, selectedSize.width, selectedSize.height)
    } else if (provider === "free_alternatives") {
      const selectedModel = model || selectedProvider.defaultModel
      console.log(`Generating image with free alternatives: ${selectedModel}, ${selectedSize.width}x${selectedSize.height}`)

      try {
        result = await generateFreeAlternatives(prompt, selectedModel!, selectedSize.width, selectedSize.height)
      } catch (error) {
        console.error("Free alternatives failed, trying pollinations as fallback:", error)
        result = await generateFreeImage(prompt, selectedModel!, selectedSize.width, selectedSize.height)
      }
    } else if (provider === "openai") {
      let apiKey: string | null = null

      if (providedApiKey) {
        apiKey = providedApiKey
      } else if (process.env.OPENAI_API_KEY) {
        apiKey = process.env.OPENAI_API_KEY
      }

      if (!apiKey) {
        return NextResponse.json(
          { error: "API key required for OpenAI. Please add your OpenAI API key." },
          { status: 401 },
        )
      }

      const selectedModel = model || selectedProvider.defaultModel
      const sizeString = `${selectedSize.width}x${selectedSize.height}`

      result = await generateOpenAIImage(prompt, apiKey, selectedModel!, sizeString)
    } else if (provider === "huggingface") {
      let apiKey = providedApiKey

      if (!apiKey && process.env.HUGGINGFACE_API_KEY) {
        apiKey = process.env.HUGGINGFACE_API_KEY
      }

      if (!apiKey) {
        return NextResponse.json(
          { error: "API key required for Hugging Face. Please add your Hugging Face API key." },
          { status: 401 },
        )
      }

      const selectedModel = model || selectedProvider.defaultModel

      result = await generateHuggingFaceImage(prompt, apiKey, selectedModel!, selectedSize)
    } else if (provider === "gemini") {
      const selectedModel = model || selectedProvider.defaultModel
      console.log(`Generating image with Gemini: ${selectedModel}, ${selectedSize.width}x${selectedSize.height}`)

      try {
        result = await generateGeminiImage(prompt, selectedModel!, selectedSize.width, selectedSize.height)
      } catch (error) {
        console.error("Gemini failed, trying pollinations as fallback:", error)
        result = await generateFreeImage(prompt, "turbo", selectedSize.width, selectedSize.height)
      }
    } else {
      return NextResponse.json({ error: "Unsupported provider" }, { status: 400 })
    }

    let finalImageUrl = result.imageUrl
    if (!result.imageUrl.startsWith("data:") && provider === "openai") {
      finalImageUrl = `/api/proxy-image?url=${encodeURIComponent(result.imageUrl)}`
    }

    return NextResponse.json({
      success: true,
      imageUrl: finalImageUrl,
      credits: result.credits,
      model: result.model,
      prompt,
      provider: selectedProvider.name,
      size: `${selectedSize.width}x${selectedSize.height}`,
      originalUrl: result.imageUrl,
    })
  } catch (error) {
    console.error("Image generation error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Image generation failed" },
      { status: 500 },
    )
  }
}
