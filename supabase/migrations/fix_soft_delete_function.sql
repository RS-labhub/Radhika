-- Fix soft delete function to handle user_id check and set is_archived
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

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION soft_delete_chat(UUID, UUID) TO authenticated;
