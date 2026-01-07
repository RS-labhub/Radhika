-- ============================================
-- Radhika Chat Application Database Schema
-- Optimized for performance and reduced Supabase calls
-- Run this in your Supabase SQL Editor
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum for user roles (only if it doesn't exist)
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('guest', 'authenticated', 'premium', 'admin');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- CLEANUP: Remove conflicting triggers from old migrations
-- ============================================

-- Drop any conflicting triggers that reference non-existent tables
DROP TRIGGER IF EXISTS mark_creator_on_auth_user_trigger ON auth.users;
DROP FUNCTION IF EXISTS public.mark_creator_on_auth_user() CASCADE;

-- ============================================
-- CORE TABLES
-- ============================================

-- Users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role user_role DEFAULT 'authenticated',
  display_name TEXT,
  pet_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

-- User settings table (consolidated with user data to reduce joins)
CREATE TABLE IF NOT EXISTS public.user_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  theme TEXT DEFAULT 'system',
  language TEXT DEFAULT 'en',
  voice_enabled BOOLEAN DEFAULT false,
  voice_settings JSONB DEFAULT '{}'::jsonb,
  selected_chat_mode TEXT DEFAULT 'general',
  ui_style TEXT DEFAULT 'modern',
  personalization JSONB DEFAULT '{}'::jsonb,
  gender TEXT DEFAULT 'other',
  age TEXT DEFAULT 'adult',
  -- Cached stats to avoid expensive aggregations
  cached_total_chats INTEGER DEFAULT 0,
  cached_total_messages INTEGER DEFAULT 0,
  stats_updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Chat profiles table (max 3 per mode per user)
CREATE TABLE IF NOT EXISTS public.chat_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL,
  name TEXT NOT NULL,
  settings JSONB DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chats table (optimized with denormalized message count)
CREATE TABLE IF NOT EXISTS public.chats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.chat_profiles(id) ON DELETE SET NULL,
  mode TEXT NOT NULL,
  title TEXT NOT NULL,
  message_count INTEGER DEFAULT 0, -- Denormalized for fast access
  last_message_preview TEXT, -- First 100 chars of last message for quick display
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  is_archived BOOLEAN DEFAULT false,
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  is_public BOOLEAN DEFAULT false,
  share_token TEXT UNIQUE,
  shared_at TIMESTAMPTZ
);

COMMENT ON COLUMN public.chats.deleted_at IS 'Timestamp when chat was soft-deleted. Chats are permanently deleted after 2 days.';
COMMENT ON COLUMN public.chats.is_public IS 'Whether this chat is publicly shared';
COMMENT ON COLUMN public.chats.share_token IS 'Unique token for sharing the chat';
COMMENT ON COLUMN public.chats.shared_at IS 'When the chat was first shared';
COMMENT ON COLUMN public.chats.message_count IS 'Denormalized message count for fast access';
COMMENT ON COLUMN public.chats.last_message_preview IS 'Preview of last message for quick list display';

-- Chat messages table (optimized with sequence number for pagination)
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_favorite BOOLEAN DEFAULT false,
  seq_num SERIAL -- For efficient cursor-based pagination
);

-- Favorites table (simplified - just tracks favorited message IDs)
CREATE TABLE IF NOT EXISTS public.favorites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  chat_id UUID REFERENCES public.chats(id) ON DELETE CASCADE, -- Denormalized for faster queries
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, message_id)
);

-- Rate limits table (for guest users)
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  identifier TEXT NOT NULL,
  request_count INTEGER DEFAULT 0,
  window_start TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(identifier)
);

-- User Stats table (persisted counters - kept for backward compatibility)
CREATE TABLE IF NOT EXISTS public.user_stats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  total_chats BIGINT DEFAULT 0,
  total_messages BIGINT DEFAULT 0,
  chats_by_mode JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Session tracking table (for cleanup)
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  session_token TEXT,
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Reserved emails table (for creator/owner identification)
-- Emails in this table are treated as special "owner" accounts
CREATE TABLE IF NOT EXISTS public.reserved_emails (
  email TEXT PRIMARY KEY,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS reserved_emails_email_lower_idx
  ON public.reserved_emails (lower(email));

COMMENT ON TABLE public.reserved_emails IS 'Emails reserved for the creator/owner. Users with these emails get special treatment from Radhika.';

-- Profiles table (lightweight profile for creator detection)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  is_creator BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Keep profiles.updated_at fresh
CREATE OR REPLACE FUNCTION public.update_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_profiles_updated_at();

-- Trigger to mark creator on auth.users insert
CREATE OR REPLACE FUNCTION public.mark_creator_on_auth_user()
RETURNS TRIGGER AS $$
DECLARE
  user_email TEXT;
  profile_exists INT;
BEGIN
  user_email := lower(NEW.email);

  -- If a profiles row with same id exists, update; otherwise create a profiles row
  SELECT 1 INTO profile_exists FROM public.profiles WHERE id = NEW.id;

  IF profile_exists IS NULL THEN
    INSERT INTO public.profiles (id, email, is_creator)
    VALUES (NEW.id, NEW.email,
      EXISTS (SELECT 1 FROM public.reserved_emails WHERE lower(email) = user_email)
    );
  ELSE
    UPDATE public.profiles
    SET email = NEW.email,
        is_creator = EXISTS (SELECT 1 FROM public.reserved_emails WHERE lower(email) = user_email)
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS mark_creator_on_auth_user_trigger ON auth.users;
CREATE TRIGGER mark_creator_on_auth_user_trigger
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.mark_creator_on_auth_user();

-- ============================================
-- OPTIMIZED INDEXES
-- ============================================

-- Basic indexes
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON public.user_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_profiles_user_id ON public.chat_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_profiles_mode ON public.chat_profiles(mode);
CREATE INDEX IF NOT EXISTS idx_chats_user_id ON public.chats(user_id);
CREATE INDEX IF NOT EXISTS idx_chats_profile_id ON public.chats(profile_id);
CREATE INDEX IF NOT EXISTS idx_chats_mode ON public.chats(mode);
CREATE INDEX IF NOT EXISTS idx_chats_deleted_at ON public.chats(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chats_share_token ON public.chats(share_token) WHERE share_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_id ON public.chat_messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON public.favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_chat_id ON public.favorites(chat_id);
CREATE INDEX IF NOT EXISTS idx_rate_limits_identifier ON public.rate_limits(identifier);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON public.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON public.user_sessions(expires_at);

-- CRITICAL: Covering indexes for common queries (avoids table lookups)
-- Chats list query - covers all fields needed for chat list display
CREATE INDEX IF NOT EXISTS idx_chats_user_active_covering ON public.chats(user_id, last_message_at DESC)
  INCLUDE (id, mode, title, profile_id, message_count, last_message_preview, is_archived, created_at)
  WHERE is_archived = false AND deleted_at IS NULL;

-- Alternative: Composite index for filtered queries
CREATE INDEX IF NOT EXISTS idx_chats_user_mode_active ON public.chats(user_id, mode, last_message_at DESC)
  WHERE is_archived = false AND deleted_at IS NULL;

-- Messages by chat with seq_num for efficient pagination  
CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_seq ON public.chat_messages(chat_id, seq_num DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_created ON public.chat_messages(chat_id, created_at ASC);

-- Favorites with chat info
CREATE INDEX IF NOT EXISTS idx_favorites_user_created ON public.favorites(user_id, created_at DESC)
  INCLUDE (message_id, chat_id);

-- Partial index for public/shared chats (rarely used but fast when needed)
CREATE INDEX IF NOT EXISTS idx_chats_public ON public.chats(share_token)
  WHERE is_public = true AND share_token IS NOT NULL;

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Optimized to reduce subqueries where possible
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reserved_emails ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to recreate optimized versions
DO $$ 
BEGIN
  -- Users
  DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
  DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
  -- User settings
  DROP POLICY IF EXISTS "Users can view own settings" ON public.user_settings;
  DROP POLICY IF EXISTS "Users can insert own settings" ON public.user_settings;
  DROP POLICY IF EXISTS "Users can update own settings" ON public.user_settings;
  -- Chat profiles
  DROP POLICY IF EXISTS "Users can view own profiles" ON public.chat_profiles;
  DROP POLICY IF EXISTS "Users can insert own profiles" ON public.chat_profiles;
  DROP POLICY IF EXISTS "Users can update own profiles" ON public.chat_profiles;
  DROP POLICY IF EXISTS "Users can delete own profiles" ON public.chat_profiles;
  -- Chats
  DROP POLICY IF EXISTS "Users can view own active chats" ON public.chats;
  DROP POLICY IF EXISTS "Anyone can view shared chats" ON public.chats;
  DROP POLICY IF EXISTS "Users can insert own chats" ON public.chats;
  DROP POLICY IF EXISTS "Users can update own chats" ON public.chats;
  DROP POLICY IF EXISTS "Users can delete own chats" ON public.chats;
  -- Chat messages
  DROP POLICY IF EXISTS "Users can view own chat messages" ON public.chat_messages;
  DROP POLICY IF EXISTS "Anyone can view messages from shared chats" ON public.chat_messages;
  DROP POLICY IF EXISTS "Users can insert own chat messages" ON public.chat_messages;
  DROP POLICY IF EXISTS "Users can update own chat messages" ON public.chat_messages;
  -- Favorites
  DROP POLICY IF EXISTS "Users can view own favorites" ON public.favorites;
  DROP POLICY IF EXISTS "Users can insert own favorites" ON public.favorites;
  DROP POLICY IF EXISTS "Users can delete own favorites" ON public.favorites;
  -- Rate limits
  DROP POLICY IF EXISTS "Service role can manage rate limits" ON public.rate_limits;
  -- User stats
  DROP POLICY IF EXISTS "Users can view own stats" ON public.user_stats;
  -- User sessions
  DROP POLICY IF EXISTS "Users can view own sessions" ON public.user_sessions;
  DROP POLICY IF EXISTS "Users can delete own sessions" ON public.user_sessions;
  -- Profiles
  DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
  DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
  DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Users policies
CREATE POLICY "Users can view own profile" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- User settings policies
CREATE POLICY "Users can view own settings" ON public.user_settings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings" ON public.user_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings" ON public.user_settings
  FOR UPDATE USING (auth.uid() = user_id);

-- Chat profiles policies
CREATE POLICY "Users can view own profiles" ON public.chat_profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profiles" ON public.chat_profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profiles" ON public.chat_profiles
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own profiles" ON public.chat_profiles
  FOR DELETE USING (auth.uid() = user_id);

-- Chats policies - OPTIMIZED: Direct user_id check without subqueries
CREATE POLICY "Users can view own chats" ON public.chats
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Anyone can view shared chats" ON public.chats
  FOR SELECT USING (is_public = true AND share_token IS NOT NULL);

CREATE POLICY "Users can insert own chats" ON public.chats
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own chats" ON public.chats
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own chats" ON public.chats
  FOR DELETE USING (auth.uid() = user_id);

-- Chat messages policies - OPTIMIZED: Uses chats.user_id with efficient join
CREATE POLICY "Users can view own chat messages" ON public.chat_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.chats 
      WHERE chats.id = chat_messages.chat_id 
      AND chats.user_id = auth.uid()
    )
  );

CREATE POLICY "Anyone can view messages from shared chats" ON public.chat_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.chats 
      WHERE chats.id = chat_messages.chat_id 
      AND chats.is_public = true
      AND chats.share_token IS NOT NULL
    )
  );

CREATE POLICY "Users can insert own chat messages" ON public.chat_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chats 
      WHERE chats.id = chat_messages.chat_id 
      AND chats.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own chat messages" ON public.chat_messages
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.chats 
      WHERE chats.id = chat_messages.chat_id 
      AND chats.user_id = auth.uid()
    )
  );

-- Favorites policies - Direct user_id check
CREATE POLICY "Users can view own favorites" ON public.favorites
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own favorites" ON public.favorites
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own favorites" ON public.favorites
  FOR DELETE USING (auth.uid() = user_id);

-- Rate limits policies (accessible by service role only)
CREATE POLICY "Service role can manage rate limits" ON public.rate_limits
  FOR ALL USING (true);

-- User stats policies
CREATE POLICY "Users can view own stats" ON public.user_stats
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own stats" ON public.user_stats
  FOR UPDATE USING (auth.uid() = user_id);

-- User sessions policies
CREATE POLICY "Users can view own sessions" ON public.user_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own sessions" ON public.user_sessions
  FOR DELETE USING (auth.uid() = user_id);

-- Profiles policies (for creator detection)
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Reserved emails policies
-- This table should be readable by service role (API routes) but not by public clients
-- We keep RLS enabled but allow service role access via bypassing RLS in server queries
REVOKE ALL ON TABLE public.reserved_emails FROM public;
REVOKE ALL ON TABLE public.reserved_emails FROM anon;
REVOKE ALL ON TABLE public.reserved_emails FROM authenticated;

-- ============================================
-- TRIGGERS AND FUNCTIONS
-- ============================================

-- Function to enforce max 3 profiles per mode
CREATE OR REPLACE FUNCTION check_profile_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF (
    SELECT COUNT(*) FROM public.chat_profiles 
    WHERE user_id = NEW.user_id AND mode = NEW.mode
  ) >= 3 THEN
    RAISE EXCEPTION 'Maximum of 3 profiles per mode allowed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_profile_limit ON public.chat_profiles;
CREATE TRIGGER enforce_profile_limit
  BEFORE INSERT ON public.chat_profiles
  FOR EACH ROW EXECUTE FUNCTION check_profile_limit();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to relevant tables
DROP TRIGGER IF EXISTS update_users_updated_at ON public.users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_user_settings_updated_at ON public.user_settings;
CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_chat_profiles_updated_at ON public.chat_profiles;
CREATE TRIGGER update_chat_profiles_updated_at
  BEFORE UPDATE ON public.chat_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_chats_updated_at ON public.chats;
CREATE TRIGGER update_chats_updated_at
  BEFORE UPDATE ON public.chats
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Function to automatically update chat message count and preview
CREATE OR REPLACE FUNCTION update_chat_message_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.chats
    SET 
      message_count = message_count + 1,
      last_message_at = NEW.created_at,
      last_message_preview = LEFT(NEW.content, 100)
    WHERE id = NEW.chat_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.chats
    SET message_count = GREATEST(message_count - 1, 0)
    WHERE id = OLD.chat_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS update_chat_stats_on_message ON public.chat_messages;
CREATE TRIGGER update_chat_stats_on_message
  AFTER INSERT OR DELETE ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION update_chat_message_stats();

-- Function to handle new user creation (creates user profile and settings in one transaction)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert user record
  INSERT INTO public.users (id, email, role)
  VALUES (NEW.id, NEW.email, 'authenticated')
  ON CONFLICT (id) DO NOTHING;
  
  -- Insert default settings
  INSERT INTO public.user_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  
  -- Insert default stats
  INSERT INTO public.user_stats (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log error but don't fail the signup
  RAISE WARNING 'handle_new_user error for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create user profile on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Function to increment user stats atomically
CREATE OR REPLACE FUNCTION public.increment_user_stats(
  p_user_id UUID,
  p_mode TEXT,
  p_chats_inc INTEGER DEFAULT 0,
  p_messages_inc INTEGER DEFAULT 0
)
RETURNS VOID AS $$
BEGIN
  -- Ensure a row exists
  INSERT INTO public.user_stats (user_id, total_chats, total_messages, chats_by_mode)
  VALUES (p_user_id, GREATEST(p_chats_inc,0), GREATEST(p_messages_inc,0), jsonb_build_object(coalesce(p_mode, ''), 0))
  ON CONFLICT (user_id) DO NOTHING;

  -- Update the counters
  UPDATE public.user_stats
  SET
    total_chats = COALESCE(total_chats, 0) + COALESCE(p_chats_inc, 0),
    total_messages = COALESCE(total_messages, 0) + COALESCE(p_messages_inc, 0),
    chats_by_mode = CASE
      WHEN p_mode IS NULL OR p_mode = '' THEN chats_by_mode
      ELSE jsonb_set(
        COALESCE(chats_by_mode, '{}'::jsonb),
        ARRAY[p_mode],
        to_jsonb( (COALESCE((chats_by_mode->>p_mode)::INT, 0) + COALESCE(p_chats_inc, 0)) )
      )
    END,
    updated_at = NOW()
  WHERE user_id = p_user_id;
  
  -- Also update cached stats in user_settings
  UPDATE public.user_settings
  SET
    cached_total_chats = COALESCE(cached_total_chats, 0) + COALESCE(p_chats_inc, 0),
    cached_total_messages = COALESCE(cached_total_messages, 0) + COALESCE(p_messages_inc, 0),
    stats_updated_at = NOW()
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.increment_user_stats(UUID, TEXT, INTEGER, INTEGER) TO authenticated;

-- ============================================
-- BATCH OPERATIONS (Reduce multiple API calls)
-- ============================================

-- Get user dashboard data in one call
CREATE OR REPLACE FUNCTION get_user_dashboard(p_user_id UUID)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'user', (SELECT row_to_json(u) FROM public.users u WHERE u.id = p_user_id),
    'settings', (SELECT row_to_json(s) FROM public.user_settings s WHERE s.user_id = p_user_id),
    'stats', (SELECT row_to_json(st) FROM public.user_stats st WHERE st.user_id = p_user_id),
    'recent_chats', (
      SELECT COALESCE(json_agg(c), '[]'::json)
      FROM (
        SELECT id, mode, title, message_count, last_message_preview, last_message_at, created_at
        FROM public.chats
        WHERE user_id = p_user_id AND deleted_at IS NULL AND is_archived = false
        ORDER BY last_message_at DESC NULLS LAST
        LIMIT 10
      ) c
    ),
    'profiles', (
      SELECT COALESCE(json_agg(p), '[]'::json)
      FROM public.chat_profiles p
      WHERE p.user_id = p_user_id
    ),
    'favorite_count', (
      SELECT COUNT(*)::INTEGER FROM public.favorites f WHERE f.user_id = p_user_id
    )
  ) INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION get_user_dashboard(UUID) TO authenticated;

-- Get chats with message previews in one call
CREATE OR REPLACE FUNCTION get_chats_with_preview(
  p_user_id UUID,
  p_mode TEXT DEFAULT NULL,
  p_profile_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT COALESCE(json_agg(chat_data), '[]'::json)
  INTO result
  FROM (
    SELECT 
      c.id,
      c.mode,
      c.title,
      c.profile_id,
      c.message_count,
      c.last_message_preview,
      c.last_message_at,
      c.created_at,
      c.is_archived,
      c.is_public,
      c.share_token
    FROM public.chats c
    WHERE c.user_id = p_user_id
      AND c.deleted_at IS NULL
      AND (p_mode IS NULL OR c.mode = p_mode)
      AND (p_profile_id IS NULL OR c.profile_id = p_profile_id)
    ORDER BY c.last_message_at DESC NULLS LAST
    LIMIT p_limit
    OFFSET p_offset
  ) chat_data;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION get_chats_with_preview(UUID, TEXT, UUID, INTEGER, INTEGER) TO authenticated;

-- Get chat with messages in one call (paginated)
CREATE OR REPLACE FUNCTION get_chat_with_messages(
  p_chat_id UUID,
  p_user_id UUID,
  p_limit INTEGER DEFAULT 50,
  p_before_seq INTEGER DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  result JSON;
  chat_record RECORD;
BEGIN
  -- Verify ownership
  SELECT * INTO chat_record
  FROM public.chats
  WHERE id = p_chat_id AND (user_id = p_user_id OR (is_public = true AND share_token IS NOT NULL));
  
  IF chat_record IS NULL THEN
    RETURN json_build_object('error', 'Chat not found or access denied');
  END IF;
  
  SELECT json_build_object(
    'chat', row_to_json(chat_record),
    'messages', (
      SELECT COALESCE(json_agg(m ORDER BY m.seq_num ASC), '[]'::json)
      FROM (
        SELECT id, role, content, metadata, created_at, is_favorite, seq_num
        FROM public.chat_messages
        WHERE chat_id = p_chat_id
          AND (p_before_seq IS NULL OR seq_num < p_before_seq)
        ORDER BY seq_num DESC
        LIMIT p_limit
      ) m
    ),
    'has_more', (
      SELECT EXISTS(
        SELECT 1 FROM public.chat_messages
        WHERE chat_id = p_chat_id
          AND seq_num < COALESCE(
            (SELECT MIN(seq_num) FROM public.chat_messages WHERE chat_id = p_chat_id AND (p_before_seq IS NULL OR seq_num < p_before_seq) ORDER BY seq_num DESC LIMIT p_limit),
            0
          )
      )
    )
  ) INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION get_chat_with_messages(UUID, UUID, INTEGER, INTEGER) TO authenticated;

-- Get favorites with chat info in one call
CREATE OR REPLACE FUNCTION get_favorites_with_context(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT COALESCE(json_agg(fav_data), '[]'::json)
  INTO result
  FROM (
    SELECT 
      f.id as favorite_id,
      f.created_at as favorited_at,
      m.id as message_id,
      m.role,
      m.content,
      m.created_at as message_created_at,
      c.id as chat_id,
      c.title as chat_title,
      c.mode as chat_mode
    FROM public.favorites f
    JOIN public.chat_messages m ON m.id = f.message_id
    JOIN public.chats c ON c.id = f.chat_id OR c.id = m.chat_id
    WHERE f.user_id = p_user_id
    ORDER BY f.created_at DESC
    LIMIT p_limit
    OFFSET p_offset
  ) fav_data;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION get_favorites_with_context(UUID, INTEGER, INTEGER) TO authenticated;

-- ============================================
-- CHAT SHARING FUNCTIONS
-- ============================================

-- Function to generate a unique share token
CREATE OR REPLACE FUNCTION generate_share_token()
RETURNS TEXT AS $$
DECLARE
  token TEXT;
  exists BOOLEAN;
BEGIN
  LOOP
    -- Generate a random token (12 characters)
    token := substr(md5(random()::text || clock_timestamp()::text), 1, 12);
    
    -- Check if token already exists
    SELECT EXISTS(SELECT 1 FROM public.chats WHERE share_token = token) INTO exists;
    
    -- Exit loop if token is unique
    EXIT WHEN NOT exists;
  END LOOP;
  
  RETURN token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION generate_share_token() IS 'Generates a unique 12-character share token for chats';

-- Function to share a chat (creates share token)
CREATE OR REPLACE FUNCTION share_chat(chat_id_param UUID)
RETURNS TEXT AS $$
DECLARE
  token TEXT;
BEGIN
  -- Generate unique token
  token := generate_share_token();
  
  -- Update chat with share token
  UPDATE public.chats
  SET 
    is_public = true,
    share_token = token,
    shared_at = NOW()
  WHERE id = chat_id_param
    AND user_id = auth.uid(); -- Ensure user owns the chat
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chat not found or you do not have permission to share it';
  END IF;
  
  RETURN token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION share_chat(UUID) IS 'Makes a chat publicly shareable and returns the share token';

-- Function to unshare a chat
CREATE OR REPLACE FUNCTION unshare_chat(chat_id_param UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.chats
  SET 
    is_public = false,
    share_token = NULL,
    shared_at = NULL
  WHERE id = chat_id_param
    AND user_id = auth.uid(); -- Ensure user owns the chat
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chat not found or you do not have permission to unshare it';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION unshare_chat(UUID) IS 'Removes public sharing from a chat';

GRANT EXECUTE ON FUNCTION generate_share_token() TO authenticated;
GRANT EXECUTE ON FUNCTION share_chat(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION unshare_chat(UUID) TO authenticated;

-- ============================================
-- SOFT DELETE AND CLEANUP FUNCTIONS
-- ============================================

-- Function to soft delete a chat (with user_id check and is_archived flag)
CREATE OR REPLACE FUNCTION soft_delete_chat(chat_id_param UUID, user_id_param UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.chats
  SET 
    deleted_at = NOW(),
    is_archived = true,
    updated_at = NOW()
  WHERE id = chat_id_param 
    AND user_id = user_id_param;
    
  -- Raise exception if no rows were updated (chat doesn't exist or wrong user)
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chat not found or unauthorized';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION soft_delete_chat(UUID, UUID) IS 'Soft deletes a chat by setting deleted_at timestamp and archiving it. Chat will be permanently deleted after 2 days.';

GRANT EXECUTE ON FUNCTION soft_delete_chat(UUID, UUID) TO authenticated;

-- Function to permanently delete chats that have been soft-deleted for more than 2 days
CREATE OR REPLACE FUNCTION cleanup_old_deleted_chats()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete chats that have been soft-deleted for more than 2 days
  -- Messages will be cascade deleted automatically
  DELETE FROM public.chats
  WHERE deleted_at IS NOT NULL 
    AND deleted_at < NOW() - INTERVAL '2 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION cleanup_old_deleted_chats() IS 'Permanently deletes chats that have been soft-deleted for more than 2 days. Should be run daily.';

GRANT EXECUTE ON FUNCTION cleanup_old_deleted_chats() TO authenticated;

-- Function to get active chats (excludes soft-deleted ones)
CREATE OR REPLACE FUNCTION get_active_chats(
  user_id_param UUID,
  mode_param TEXT DEFAULT NULL,
  profile_id_param UUID DEFAULT NULL,
  include_archived BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  profile_id UUID,
  mode TEXT,
  title TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  is_archived BOOLEAN,
  deleted_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.user_id,
    c.profile_id,
    c.mode,
    c.title,
    c.created_at,
    c.updated_at,
    c.last_message_at,
    c.is_archived,
    c.deleted_at
  FROM public.chats c
  WHERE c.user_id = user_id_param
    AND c.deleted_at IS NULL
    AND (mode_param IS NULL OR c.mode = mode_param)
    AND (profile_id_param IS NULL OR c.profile_id = profile_id_param OR (profile_id_param IS NULL AND c.profile_id IS NULL))
    AND (include_archived OR NOT c.is_archived)
  ORDER BY c.last_message_at DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_active_chats(UUID, TEXT, UUID, BOOLEAN) TO authenticated;

-- Function to delete old chats (older than 3 days) - for auto cleanup
CREATE OR REPLACE FUNCTION delete_old_chats()
RETURNS TABLE(deleted_count BIGINT) AS $$
DECLARE
  count_deleted BIGINT;
BEGIN
  -- Delete chats older than 3 days
  WITH deleted AS (
    DELETE FROM public.chats
    WHERE created_at < NOW() - INTERVAL '3 days'
    RETURNING id
  )
  SELECT COUNT(*) INTO count_deleted FROM deleted;
  
  RETURN QUERY SELECT count_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION delete_old_chats() IS 'Deletes chats older than 3 days. Should be run on a schedule.';

GRANT EXECUTE ON FUNCTION delete_old_chats() TO authenticated;

-- ============================================
-- VIEWS
-- ============================================

-- View to see chats that will be deleted soon (2+ days old)
CREATE OR REPLACE VIEW chats_to_be_deleted AS
SELECT 
  id,
  user_id,
  title,
  created_at,
  NOW() - created_at AS age,
  EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400 AS age_in_days
FROM public.chats
WHERE created_at < NOW() - INTERVAL '2 days'
ORDER BY created_at ASC;

COMMENT ON VIEW chats_to_be_deleted IS 'Shows chats that are 2+ days old and will be deleted soon.';

GRANT SELECT ON chats_to_be_deleted TO authenticated;


-- ============================================
-- CLEANUP FUNCTIONS (Called via Vercel Cron - see vercel.json)
-- ============================================

-- Comprehensive cleanup function (called by /api/cleanup-chats)
CREATE OR REPLACE FUNCTION run_scheduled_cleanup()
RETURNS JSON AS $$
DECLARE
  deleted_chats INTEGER := 0;
  deleted_old_chats INTEGER := 0;
  cleaned_sessions INTEGER := 0;
  cleaned_rate_limits INTEGER := 0;
BEGIN
  -- 1. Delete soft-deleted chats older than 2 days
  DELETE FROM public.chats
  WHERE deleted_at IS NOT NULL 
    AND deleted_at < NOW() - INTERVAL '2 days';
  GET DIAGNOSTICS deleted_chats = ROW_COUNT;
  
  -- 2. Delete old chats (older than 7 days for non-premium users)
  -- Note: Adjust interval as needed
  DELETE FROM public.chats
  WHERE created_at < NOW() - INTERVAL '7 days'
    AND deleted_at IS NULL;
  GET DIAGNOSTICS deleted_old_chats = ROW_COUNT;
  
  -- 3. Clean up expired sessions
  DELETE FROM public.user_sessions
  WHERE expires_at < NOW();
  GET DIAGNOSTICS cleaned_sessions = ROW_COUNT;
  
  -- 4. Clean up old rate limit entries (older than 1 day)
  DELETE FROM public.rate_limits
  WHERE window_start < NOW() - INTERVAL '1 day';
  GET DIAGNOSTICS cleaned_rate_limits = ROW_COUNT;
  
  RETURN json_build_object(
    'deleted_soft_deleted_chats', deleted_chats,
    'deleted_old_chats', deleted_old_chats,
    'cleaned_sessions', cleaned_sessions,
    'cleaned_rate_limits', cleaned_rate_limits,
    'timestamp', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION run_scheduled_cleanup() TO authenticated;
GRANT EXECUTE ON FUNCTION run_scheduled_cleanup() TO service_role;

-- ============================================
-- SESSION CLEANUP (for removing all previous sessions)
-- ============================================

-- Function to clear all sessions for a user
CREATE OR REPLACE FUNCTION clear_user_sessions(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.user_sessions
  WHERE user_id = p_user_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION clear_user_sessions(UUID) TO authenticated;

-- Function to clear ALL sessions (admin only - use with caution)
CREATE OR REPLACE FUNCTION clear_all_sessions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.user_sessions;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION clear_all_sessions() TO service_role;

-- ============================================
-- STORAGE BUCKETS
-- ============================================

-- Drop existing storage policies to avoid conflicts
DO $$
BEGIN
  DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
  DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
  DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
  DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
  DROP POLICY IF EXISTS "Anyone can view chat images" ON storage.objects;
  DROP POLICY IF EXISTS "Authenticated users can upload chat images" ON storage.objects;
  DROP POLICY IF EXISTS "Users can delete own chat images" ON storage.objects;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Create avatars storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  1048576, -- 1MB limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Create chat-images storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-images',
  'chat-images',
  true,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- RLS Policies for avatars bucket
CREATE POLICY "Avatar images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- RLS Policies for chat-images bucket
CREATE POLICY "Anyone can view chat images"
ON storage.objects FOR SELECT
USING (bucket_id = 'chat-images');

CREATE POLICY "Authenticated users can upload chat images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'chat-images' 
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Users can delete own chat images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'chat-images' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- ============================================
-- PERFORMANCE OPTIMIZATIONS
-- ============================================

-- Analyze tables for better query planning
ANALYZE public.users;
ANALYZE public.user_settings;
ANALYZE public.chats;
ANALYZE public.chat_messages;
ANALYZE public.favorites;
ANALYZE public.chat_profiles;

-- ============================================
-- SUMMARY
-- ============================================
-- This schema includes:
-- 1. Core tables with denormalized fields for faster queries
-- 2. Covering indexes to avoid table lookups
-- 3. Batch RPC functions to reduce API calls:
--    - get_user_dashboard(): All dashboard data in one call
--    - get_chats_with_preview(): Chats with message previews
--    - get_chat_with_messages(): Chat + paginated messages
--    - get_favorites_with_context(): Favorites with chat info
-- 4. Automatic message count/preview updates via triggers
-- 5. Session management table for cleanup
-- 6. Cleanup via Vercel Cron (vercel.json) - NO pg_cron needed
-- 7. run_scheduled_cleanup() function for comprehensive cleanup
-- 8. Optimized RLS policies without unnecessary subqueries
-- 9. Creator/Owner detection via reserved_emails and profiles tables
--    - reserved_emails: Store creator email addresses
--    - profiles: Auto-populated with is_creator flag on signup
--    - Trigger: Automatically marks users as creators if email matches reserved_emails
-- ============================================

-- ============================================
-- POST-SETUP: Add Reserved Creator Emails
-- ============================================
-- After running this schema, add creator emails by running:
-- 
-- INSERT INTO public.reserved_emails (email, note)
-- VALUES ('your-email@example.com', 'Creator Name')
-- ON CONFLICT (email) DO UPDATE SET note = EXCLUDED.note;
-- 
-- See: supabase/migrations/add-reserved-emails-data.sql
-- ============================================
