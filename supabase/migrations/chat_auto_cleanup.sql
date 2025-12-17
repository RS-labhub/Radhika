-- Migration: Auto-delete chats older than 3 days
-- This sets up a scheduled job to clean up old chats

-- Function to delete old chats
CREATE OR REPLACE FUNCTION delete_old_chats()
RETURNS void AS $$
BEGIN
  -- Delete chats older than 3 days
  DELETE FROM public.chats
  WHERE created_at < NOW() - INTERVAL '3 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Note: To schedule this function to run automatically, you need to:
-- 1. Use Supabase's pg_cron extension (if available)
-- 2. Or set up a cron job/scheduled task that calls this function via an Edge Function
-- 3. Or use Supabase Edge Functions with a scheduled trigger

-- Example using pg_cron (if enabled):
-- SELECT cron.schedule('delete-old-chats', '0 2 * * *', 'SELECT delete_old_chats();');
-- This runs daily at 2 AM

-- Grant execute permission to authenticated users (optional, for manual cleanup)
GRANT EXECUTE ON FUNCTION delete_old_chats() TO authenticated;

-- Create a view to see which chats will be deleted soon
CREATE OR REPLACE VIEW public.chats_to_be_deleted AS
SELECT 
  id,
  user_id,
  title,
  mode,
  created_at,
  NOW() - created_at AS age,
  (NOW() - created_at) > INTERVAL '3 days' AS will_be_deleted
FROM public.chats
WHERE (NOW() - created_at) > INTERVAL '2 days'; -- Show chats older than 2 days

-- Add comment
COMMENT ON FUNCTION delete_old_chats() IS 'Deletes chats older than 3 days. Should be run on a schedule.';
COMMENT ON VIEW chats_to_be_deleted IS 'Shows chats that are 2+ days old and will be deleted soon.';
