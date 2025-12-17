-- Fix RLS policy for chats table to allow updates with WITH CHECK clause
-- This fixes the "new row violates row-level security policy" error when updating chats

-- Drop the existing update policy
DROP POLICY IF EXISTS "Users can update own chats" ON public.chats;

-- Recreate the policy with both USING and WITH CHECK clauses
CREATE POLICY "Users can update own chats" ON public.chats
  FOR UPDATE 
  USING (auth.uid() = user_id) 
  WITH CHECK (auth.uid() = user_id);
