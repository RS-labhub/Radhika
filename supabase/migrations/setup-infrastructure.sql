-- ============================================================
-- RADHIKA INFRASTRUCTURE SETUP
-- Run this entire script in Supabase SQL Editor
-- ============================================================

-- ============================================================
-- PART 1: Add Shareable Chats Support
-- ============================================================

-- Drop views that depend on the chats table
DROP VIEW IF EXISTS chats_to_be_deleted CASCADE;

-- Add new columns to chats table
ALTER TABLE public.chats 
ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS share_token TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS shared_at TIMESTAMPTZ;

-- Create index for fast lookup by share token
CREATE INDEX IF NOT EXISTS idx_chats_share_token ON public.chats(share_token) WHERE share_token IS NOT NULL;

-- Drop existing functions to avoid conflicts
DROP FUNCTION IF EXISTS generate_share_token();
DROP FUNCTION IF EXISTS share_chat(UUID);
DROP FUNCTION IF EXISTS unshare_chat(UUID);

-- Function to generate unique share token (12 char MD5 hash)
CREATE OR REPLACE FUNCTION generate_share_token()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  new_token TEXT;
  token_exists BOOLEAN;
BEGIN
  LOOP
    -- Generate a 12-character MD5 hash
    new_token := substring(md5(random()::text || clock_timestamp()::text) from 1 for 12);
    
    -- Check if token already exists
    SELECT EXISTS(SELECT 1 FROM public.chats WHERE share_token = new_token) INTO token_exists;
    
    -- Exit loop if unique
    IF NOT token_exists THEN
      EXIT;
    END IF;
  END LOOP;
  
  RETURN new_token;
END;
$$;

-- RPC function to share a chat (returns the share token)
CREATE OR REPLACE FUNCTION share_chat(chat_id_param UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  existing_token TEXT;
  new_token TEXT;
  current_user_id UUID;
BEGIN
  -- Get current user
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  -- Check if chat already has a share token
  SELECT share_token INTO existing_token
  FROM public.chats
  WHERE id = chat_id_param AND user_id = current_user_id;
  
  -- If already shared, return existing token
  IF existing_token IS NOT NULL THEN
    RETURN existing_token;
  END IF;
  
  -- Generate new token
  new_token := generate_share_token();
  
  -- Update the chat
  UPDATE public.chats
  SET 
    is_public = true,
    share_token = new_token,
    shared_at = NOW()
  WHERE id = chat_id_param AND user_id = current_user_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chat not found or access denied';
  END IF;
  
  RETURN new_token;
END;
$$;

-- RPC function to unshare a chat
CREATE OR REPLACE FUNCTION unshare_chat(chat_id_param UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_user_id UUID;
BEGIN
  -- Get current user
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  -- Update the chat
  UPDATE public.chats
  SET 
    is_public = false,
    share_token = NULL,
    shared_at = NULL
  WHERE id = chat_id_param AND user_id = current_user_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chat not found or access denied';
  END IF;
END;
$$;

-- Drop existing RLS policies if they exist
DROP POLICY IF EXISTS "Public read access to shared chats" ON public.chats;
DROP POLICY IF EXISTS "Public read access to messages in shared chats" ON public.chat_messages;

-- Add RLS policy for public read access to shared chats
CREATE POLICY "Public read access to shared chats"
ON public.chats
FOR SELECT
TO anon, authenticated
USING (is_public = true);

-- Add RLS policy for public read access to messages in shared chats
CREATE POLICY "Public read access to messages in shared chats"
ON public.chat_messages
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.chats
    WHERE chats.id = chat_messages.chat_id
    AND chats.is_public = true
  )
);

-- ============================================================
-- PART 2: Auto-Cleanup Old Chats (3 days)
-- ============================================================

-- Drop existing function if it exists (to avoid return type conflicts)
DROP FUNCTION IF EXISTS delete_old_chats();

-- Function to delete chats older than 3 days
CREATE OR REPLACE FUNCTION delete_old_chats()
RETURNS TABLE(deleted_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
$$;

-- Create a view to preview chats that will be deleted soon (2+ days old)
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

-- Grant access to the view
GRANT SELECT ON chats_to_be_deleted TO authenticated;

-- ============================================================
-- PART 3: Storage Bucket for Chat Images
-- ============================================================

-- Create storage bucket for chat images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-images',
  'chat-images',
  true, -- public bucket
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Drop existing storage policies if they exist
DROP POLICY IF EXISTS "Authenticated users can upload images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view chat images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own images" ON storage.objects;

-- Storage policy: Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'chat-images' AND
  auth.uid() IS NOT NULL
);

-- Storage policy: Anyone can view images (public bucket)
CREATE POLICY "Anyone can view chat images"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'chat-images');

-- Storage policy: Users can only delete their own images
CREATE POLICY "Users can delete own images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'chat-images' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================

-- Check if columns were added
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'chats' 
AND column_name IN ('is_public', 'share_token', 'shared_at')
ORDER BY ordinal_position;

-- Check if functions exist
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN ('share_chat', 'unshare_chat', 'delete_old_chats', 'generate_share_token')
ORDER BY routine_name;

-- Check if bucket was created
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'chat-images';

-- Check RLS policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename IN ('chats', 'chat_messages')
AND policyname LIKE '%public%' OR policyname LIKE '%shared%'
ORDER BY tablename, policyname;
