-- Migration: Add shareable chat functionality

-- Add columns to chats table for sharing
ALTER TABLE public.chats ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;
ALTER TABLE public.chats ADD COLUMN IF NOT EXISTS share_token TEXT UNIQUE;
ALTER TABLE public.chats ADD COLUMN IF NOT EXISTS shared_at TIMESTAMPTZ;

-- Create index on share_token for faster lookups
CREATE INDEX IF NOT EXISTS idx_chats_share_token ON public.chats(share_token) WHERE share_token IS NOT NULL;

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

-- RLS policy for public shared chats (anyone can view)
CREATE POLICY "Anyone can view shared chats" ON public.chats
  FOR SELECT USING (is_public = true AND share_token IS NOT NULL);

-- RLS policy for public shared chat messages (anyone can view)
CREATE POLICY "Anyone can view messages from shared chats" ON public.chat_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.chats 
      WHERE chats.id = chat_messages.chat_id 
      AND chats.is_public = true
      AND chats.share_token IS NOT NULL
    )
  );

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION generate_share_token() TO authenticated;
GRANT EXECUTE ON FUNCTION share_chat(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION unshare_chat(UUID) TO authenticated;

-- Add comments
COMMENT ON COLUMN public.chats.is_public IS 'Whether this chat is publicly shared';
COMMENT ON COLUMN public.chats.share_token IS 'Unique token for sharing the chat';
COMMENT ON COLUMN public.chats.shared_at IS 'When the chat was first shared';
COMMENT ON FUNCTION share_chat(UUID) IS 'Makes a chat publicly shareable and returns the share token';
COMMENT ON FUNCTION unshare_chat(UUID) IS 'Removes public sharing from a chat';
