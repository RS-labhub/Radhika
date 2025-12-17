-- Add deleted_at column to chats table for soft deletes
ALTER TABLE public.chats 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Create index on deleted_at for cleanup queries
CREATE INDEX IF NOT EXISTS idx_chats_deleted_at ON public.chats(deleted_at) WHERE deleted_at IS NOT NULL;

-- Update the foreign key constraint to CASCADE delete chats when profile is deleted
-- First, drop the existing constraint
ALTER TABLE public.chats 
DROP CONSTRAINT IF EXISTS chats_profile_id_fkey;

-- Add the new constraint with CASCADE delete
ALTER TABLE public.chats 
ADD CONSTRAINT chats_profile_id_fkey 
FOREIGN KEY (profile_id) 
REFERENCES public.chat_profiles(id) 
ON DELETE CASCADE;

-- Function to soft delete a chat (mark as deleted instead of removing)
CREATE OR REPLACE FUNCTION soft_delete_chat(chat_id_param UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.chats
  SET deleted_at = NOW()
  WHERE id = chat_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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

-- Function to get chats excluding soft-deleted ones (unless archived view is requested)
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

-- Create a scheduled job to run cleanup daily (if pg_cron is available)
-- Note: This requires pg_cron extension which may not be available in all Supabase projects
-- You can also run this manually or via an edge function on a schedule
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Use a different dollar-quote tag for the nested command to avoid
    -- terminating the outer dollar-quoted DO block.
    PERFORM cron.schedule(
      'cleanup-deleted-chats',
      '0 2 * * *', -- Run at 2 AM every day
      $cron$SELECT cleanup_old_deleted_chats();$cron$
    );
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'pg_cron extension not available, skipping scheduled cleanup job';
END;
$$;

-- Grant execute permissions on the functions
GRANT EXECUTE ON FUNCTION soft_delete_chat(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_old_deleted_chats() TO authenticated;
GRANT EXECUTE ON FUNCTION get_active_chats(UUID, TEXT, UUID, BOOLEAN) TO authenticated;

-- Update RLS policies to exclude soft-deleted chats
-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own chats" ON public.chats;
DROP POLICY IF EXISTS "Users can insert own chats" ON public.chats;
DROP POLICY IF EXISTS "Users can update own chats" ON public.chats;
DROP POLICY IF EXISTS "Users can delete own chats" ON public.chats;

-- Create new policies that exclude soft-deleted chats
CREATE POLICY "Users can view own active chats" ON public.chats
  FOR SELECT USING (auth.uid() = user_id AND deleted_at IS NULL);

CREATE POLICY "Users can insert own chats" ON public.chats
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own chats" ON public.chats
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can soft delete own chats" ON public.chats
  FOR UPDATE USING (auth.uid() = user_id);

-- Comment explaining the setup
COMMENT ON COLUMN public.chats.deleted_at IS 'Timestamp when chat was soft-deleted. Chats are permanently deleted after 2 days.';
COMMENT ON FUNCTION cleanup_old_deleted_chats() IS 'Permanently deletes chats that have been soft-deleted for more than 2 days. Should be run daily.';
COMMENT ON FUNCTION soft_delete_chat(UUID) IS 'Soft deletes a chat by setting deleted_at timestamp. Chat will be permanently deleted after 2 days.';
