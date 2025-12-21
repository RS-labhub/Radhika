-- ============================================
-- Radhika Chat Application Database Schema
-- Consolidated schema with all migrations applied
-- Run this in your Supabase SQL Editor
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum for user roles
CREATE TYPE user_role AS ENUM ('guest', 'authenticated', 'premium', 'admin');

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

-- User settings table
CREATE TABLE IF NOT EXISTS public.user_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  theme TEXT DEFAULT 'system',
  language TEXT DEFAULT 'en',
  voice_enabled BOOLEAN DEFAULT false,
  voice_settings JSONB,
  selected_chat_mode TEXT DEFAULT 'general',
  ui_style TEXT DEFAULT 'modern',
  personalization JSONB,
  gender TEXT DEFAULT 'other',
  age TEXT DEFAULT 'adult',
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
  settings JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chats table (includes soft delete and sharing features)
CREATE TABLE IF NOT EXISTS public.chats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.chat_profiles(id) ON DELETE CASCADE,
  mode TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ,
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

-- Chat messages table
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_favorite BOOLEAN DEFAULT false
);

-- Favorites table
CREATE TABLE IF NOT EXISTS public.favorites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
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

-- User Stats table (persisted counters that don't change when chats/messages are deleted)
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

-- ============================================
-- INDEXES
-- ============================================

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
CREATE INDEX IF NOT EXISTS idx_rate_limits_identifier ON public.rate_limits(identifier);

-- Optimized composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_chats_user_active_last_message ON public.chats(user_id, last_message_at DESC)
  WHERE is_archived = false AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_chats_user_mode_profile_active_last_message ON public.chats(user_id, mode, profile_id, last_message_at DESC)
  WHERE is_archived = false AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_id_created_at ON public.chat_messages(chat_id, created_at DESC);

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
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

-- Chats policies (includes soft delete and sharing support)
CREATE POLICY "Users can view own active chats" ON public.chats
  FOR SELECT USING (auth.uid() = user_id AND deleted_at IS NULL);

CREATE POLICY "Anyone can view shared chats" ON public.chats
  FOR SELECT USING (is_public = true AND share_token IS NOT NULL);

CREATE POLICY "Users can insert own chats" ON public.chats
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own chats" ON public.chats
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own chats" ON public.chats
  FOR DELETE USING (auth.uid() = user_id);

-- Chat messages policies (includes support for shared chats)
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

-- Favorites policies
CREATE POLICY "Users can view own favorites" ON public.favorites
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own favorites" ON public.favorites
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own favorites" ON public.favorites
  FOR DELETE USING (auth.uid() = user_id);

-- Rate limits policies (accessible by service role only for guests)
CREATE POLICY "Service role can manage rate limits" ON public.rate_limits
  FOR ALL USING (true);

-- User stats policies
CREATE POLICY "Users can view own stats" ON public.user_stats
  FOR SELECT USING (auth.uid() = user_id);

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
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_chat_profiles_updated_at
  BEFORE UPDATE ON public.chat_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_chats_updated_at
  BEFORE UPDATE ON public.chats
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Function to handle new user creation
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, role)
  VALUES (NEW.id, NEW.email, 'authenticated');
  
  INSERT INTO public.user_settings (user_id)
  VALUES (NEW.id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create user profile on signup
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
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.increment_user_stats(UUID, TEXT, INTEGER, INTEGER) TO authenticated;

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
-- STORAGE BUCKETS
-- ============================================

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
-- SCHEDULED CLEANUP (Optional - requires pg_cron)
-- ============================================

-- Note: This requires pg_cron extension which may not be available in all Supabase projects
-- You can also run cleanup functions manually or via an edge function on a schedule
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Schedule cleanup of soft-deleted chats (runs at 2 AM every day)
    PERFORM cron.schedule(
      'cleanup-deleted-chats',
      '0 2 * * *',
      $cron$SELECT cleanup_old_deleted_chats();$cron$
    );
    
    -- Schedule cleanup of old chats (runs at 3 AM every day)
    PERFORM cron.schedule(
      'cleanup-old-chats',
      '0 3 * * *',
      $cron$SELECT delete_old_chats();$cron$
    );
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'pg_cron extension not available, skipping scheduled cleanup jobs';
END;
$$;

-- ============================================
-- SUMMARY
-- ============================================
-- This schema includes:
-- 1. Core tables: users, user_settings, chat_profiles, chats, chat_messages, favorites, rate_limits, user_stats
-- 2. Soft delete support with deleted_at column and cleanup functions
-- 3. Chat sharing functionality with share tokens
-- 4. Auto-cleanup of old chats (3+ days)
-- 5. Comprehensive RLS policies for security
-- 6. Storage buckets for avatars and chat images
-- 7. Helper functions for stats tracking and chat management
-- 8. Scheduled jobs for automated cleanup (if pg_cron is available)
-- ============================================
