-- ============================================
-- Session and Stale Data Cleanup Script
-- Run this in your Supabase SQL Editor to clean up all sessions
-- ============================================

-- 1. Clear all user sessions
TRUNCATE TABLE public.user_sessions;

-- 2. Clear all rate limits (resets rate limiting)
TRUNCATE TABLE public.rate_limits;

-- 3. Clear soft-deleted chats that are older than 2 days
DELETE FROM public.chats
WHERE deleted_at IS NOT NULL 
  AND deleted_at < NOW() - INTERVAL '2 days';

-- 4. Clear archived chats older than 7 days (optional - uncomment if needed)
-- DELETE FROM public.chats
-- WHERE is_archived = true 
--   AND updated_at < NOW() - INTERVAL '7 days';

-- 5. Invalidate all Supabase auth sessions (forces re-login)
-- WARNING: This will log out ALL users immediately
-- Only run this if you want to force everyone to re-authenticate
-- 
-- To selectively clear sessions, use the Supabase Dashboard:
-- Authentication > Users > Select User > Sessions > Revoke All
--
-- Or use the admin API:
-- DELETE FROM auth.sessions WHERE created_at < NOW() - INTERVAL '7 days';

-- 6. Clean up orphaned data
-- Remove favorites that point to non-existent messages
DELETE FROM public.favorites f
WHERE NOT EXISTS (
  SELECT 1 FROM public.chat_messages m WHERE m.id = f.message_id
);

-- 7. Update favorites table to include chat_id where missing
UPDATE public.favorites f
SET chat_id = m.chat_id
FROM public.chat_messages m
WHERE f.message_id = m.id
  AND f.chat_id IS NULL;

-- 8. Recalculate message counts for all chats (fixes any inconsistencies)
UPDATE public.chats c
SET message_count = (
  SELECT COUNT(*) FROM public.chat_messages m WHERE m.chat_id = c.id
);

-- 9. Update last_message_preview for all chats
UPDATE public.chats c
SET last_message_preview = (
  SELECT LEFT(m.content, 100)
  FROM public.chat_messages m
  WHERE m.chat_id = c.id
  ORDER BY m.created_at DESC
  LIMIT 1
);

-- 10. Vacuum and analyze tables for better performance
VACUUM ANALYZE public.users;
VACUUM ANALYZE public.user_settings;
VACUUM ANALYZE public.user_stats;
VACUUM ANALYZE public.chats;
VACUUM ANALYZE public.chat_messages;
VACUUM ANALYZE public.chat_profiles;
VACUUM ANALYZE public.favorites;
VACUUM ANALYZE public.rate_limits;

-- Report cleanup results
SELECT 
  'Cleanup Complete' as status,
  (SELECT COUNT(*) FROM public.chats WHERE deleted_at IS NULL) as active_chats,
  (SELECT COUNT(*) FROM public.chat_messages) as total_messages,
  (SELECT COUNT(*) FROM public.favorites) as total_favorites,
  (SELECT COUNT(*) FROM public.users) as total_users,
  NOW() as cleaned_at;
