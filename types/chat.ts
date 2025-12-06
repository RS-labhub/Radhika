import type { ComponentType } from "react"

export type Mode = "general" | "productivity" | "wellness" | "learning" | "creative" | "bff"

export type Provider = "groq" | "gemini" | "openai" | "claude"

// User personalization settings
export type UserGender = "boy" | "girl" | "other"
export type UserAge = "kid" | "teenage" | "mature" | "senior"

export interface UserPersonalization {
  gender: UserGender
  age: UserAge
}

export type KeyProvider = Provider | "huggingface"

export type UIStyle = "modern" | "pixel"

export interface ModeDefinition {
	icon: ComponentType<{ className?: string }>
	label: string
	description: string
	placeholder: string
	color: string
	bg: string
	bgPixel: string
	border: string
	borderPixel: string
	gradient: string
	glow: string
}

export interface ProviderDefinition {
	name: string
	description: string
	models: string[]
	requiresApiKey: boolean
	color: string
}

export interface KeyProviderMetadata {
	name: string
	description?: string
}
