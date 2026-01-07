export type UserRole = 'guest' | 'authenticated' | 'premium' | 'admin'

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          role: UserRole
          created_at: string
          updated_at: string
          last_login_at: string | null
          display_name: string | null
          avatar_url: string | null
        }
        Insert: {
          id: string
          email: string
          role?: UserRole
          created_at?: string
          updated_at?: string
          last_login_at?: string | null
          display_name?: string | null
          avatar_url?: string | null
        }
        Update: {
          id?: string
          email?: string
          role?: UserRole
          created_at?: string
          updated_at?: string
          last_login_at?: string | null
          display_name?: string | null
          avatar_url?: string | null
        }
      }
      user_settings: {
        Row: {
          id: string
          user_id: string
          theme: string
          language: string
          voice_enabled: boolean
          voice_settings: Json | null
          selected_chat_mode: string
          ui_style: string
          personalization: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          theme?: string
          language?: string
          voice_enabled?: boolean
          voice_settings?: Json | null
          selected_chat_mode?: string
          ui_style?: string
          personalization?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          theme?: string
          language?: string
          voice_enabled?: boolean
          voice_settings?: Json | null
          selected_chat_mode?: string
          ui_style?: string
          personalization?: Json | null
          created_at?: string
          updated_at?: string
        }
      }
      chat_profiles: {
        Row: {
          id: string
          user_id: string
          mode: string
          name: string
          settings: Json | null
          metadata: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          mode: string
          name: string
          settings?: Json | null
          metadata?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          mode?: string
          name?: string
          settings?: Json | null
          metadata?: Json | null
          created_at?: string
          updated_at?: string
        }
      }
      chats: {
        Row: {
          id: string
          user_id: string
          profile_id: string | null
          mode: string
          title: string
          created_at: string
          updated_at: string
          last_message_at: string | null
          is_archived: boolean
        }
        Insert: {
          id?: string
          user_id: string
          profile_id?: string | null
          mode: string
          title: string
          created_at?: string
          updated_at?: string
          last_message_at?: string | null
          is_archived?: boolean
        }
        Update: {
          id?: string
          user_id?: string
          profile_id?: string | null
          mode?: string
          title?: string
          created_at?: string
          updated_at?: string
          last_message_at?: string | null
          is_archived?: boolean
        }
      }
      chat_messages: {
        Row: {
          id: string
          chat_id: string
          role: string
          content: string
          metadata: Json | null
          created_at: string
          is_favorite: boolean
        }
        Insert: {
          id?: string
          chat_id: string
          role: string
          content: string
          metadata?: Json | null
          created_at?: string
          is_favorite?: boolean
        }
        Update: {
          id?: string
          chat_id?: string
          role?: string
          content?: string
          metadata?: Json | null
          created_at?: string
          is_favorite?: boolean
        }
      }
      favorites: {
        Row: {
          id: string
          user_id: string
          message_id: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          message_id: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          message_id?: string
          created_at?: string
        }
      }
      rate_limits: {
        Row: {
          id: string
          identifier: string
          request_count: number
          window_start: string
          created_at: string
        }
        Insert: {
          id?: string
          identifier: string
          request_count?: number
          window_start?: string
          created_at?: string
        }
        Update: {
          id?: string
          identifier?: string
          request_count?: number
          window_start?: string
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      user_role: UserRole
    }
  }
}

// Helper types for easier usage
export type User = Database['public']['Tables']['users']['Row']
export type UserInsert = Database['public']['Tables']['users']['Insert']
export type UserUpdate = Database['public']['Tables']['users']['Update']

export type UserSettings = Database['public']['Tables']['user_settings']['Row']
export type UserSettingsInsert = Database['public']['Tables']['user_settings']['Insert']
export type UserSettingsUpdate = Database['public']['Tables']['user_settings']['Update']

export type ChatProfile = Database['public']['Tables']['chat_profiles']['Row']
export type ChatProfileInsert = Database['public']['Tables']['chat_profiles']['Insert']
export type ChatProfileUpdate = Database['public']['Tables']['chat_profiles']['Update']

export type Chat = Database['public']['Tables']['chats']['Row']
export type ChatInsert = Database['public']['Tables']['chats']['Insert']
export type ChatUpdate = Database['public']['Tables']['chats']['Update']

export type ChatMessage = Database['public']['Tables']['chat_messages']['Row']
export type ChatMessageInsert = Database['public']['Tables']['chat_messages']['Insert']
export type ChatMessageUpdate = Database['public']['Tables']['chat_messages']['Update']

export type Favorite = Database['public']['Tables']['favorites']['Row']
export type FavoriteInsert = Database['public']['Tables']['favorites']['Insert']
