import type { ComponentType } from "react"

export type Mode = "general" | "productivity" | "wellness" | "learning" | "creative" | "bff"

export type Provider = "groq" | "gemini" | "openai" | "claude"

// User personalization settings
export type UserGender = "boy" | "girl" | "other"
export type UserAge = "kid" | "teenage" | "mature" | "senior"
export type ConversationTone = "professional" | "casual" | "friendly" | "empathetic" | "playful"

export interface UserPersonalization {
  gender: UserGender
  age: UserAge
	tone?: ConversationTone
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

// Database models
export interface User {
	id: string
	email: string
	role: "guest" | "authenticated" | "premium" | "admin"
	display_name?: string
	avatar_url?: string
	created_at: string
	updated_at: string
	last_login_at?: string
}

export interface UserSettings {
	id: string
	user_id: string
	theme: string
	language: string
	voice_enabled: boolean
	voice_settings?: Record<string, any>
	selected_chat_mode: Mode
	ui_style: UIStyle
	personalization?: UserPersonalization
	created_at: string
	updated_at: string
}

export interface ChatProfile {
	id: string
	user_id: string
	mode: Mode
	name: string
	settings?: Record<string, any>
	metadata?: Record<string, any>
	created_at: string
	updated_at: string
}

export interface Chat {
	id: string
	user_id: string
	profile_id?: string
	mode: Mode
	title: string
	message_count?: number
	last_message_preview?: string
	created_at: string
	updated_at: string
	last_message_at?: string
	is_archived: boolean
	deleted_at?: string
	is_public?: boolean
	share_token?: string
	shared_at?: string
}

export interface ChatMessage {
	id: string
	chat_id: string
	role: "user" | "assistant" | "system"
	content: string
	metadata?: Record<string, any>
	sources?: Source[]
	created_at: string
	is_favorite: boolean
}

export interface Source {
	title: string
	url: string
	type?: "documentation" | "wikipedia" | "article" | "other"
	snippet?: string
}

export interface Favorite {
	id: string
	user_id: string
	message_id: string
	chat_id?: string
	created_at: string
}
