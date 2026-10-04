-- Adds the tone column used by personalization (present in the Appwrite schema, missing from the older Supabase schema)
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS tone TEXT DEFAULT 'friendly';
