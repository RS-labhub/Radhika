-- Migration: create reserved_emails, profiles RLS/policies, auth trigger, and backfill
-- Date: 2025-12-18

-- 1) Create reserved_emails table (idempotent)
CREATE TABLE IF NOT EXISTS public.reserved_emails (
  email text PRIMARY KEY,
  note text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reserved_emails_email_lower_idx
  ON public.reserved_emails (lower(email));

-- 2) Ensure profiles table has the expected columns
-- If your project already has a profiles table, this will not overwrite it.
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email text,
  full_name text,
  is_creator boolean DEFAULT false,
  updated_at timestamptz DEFAULT now()
);

-- Keep updated_at fresh
CREATE OR REPLACE FUNCTION public.update_profiles_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_profiles_updated_at();

-- 3) Trigger/function to mark creator on auth.users insert
CREATE OR REPLACE FUNCTION public.mark_creator_on_auth_user()
RETURNS trigger AS $$
DECLARE
  user_email text;
  profile_exists int;
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

-- 4) Enable RLS and apply policies
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.reserved_emails ENABLE ROW LEVEL SECURITY;

-- Defensive: remove public privileges
REVOKE ALL ON TABLE public.profiles FROM public;
REVOKE ALL ON TABLE public.reserved_emails FROM public;

-- Drop existing profiles policies if present
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'profiles_select_own' AND polrelid = 'public.profiles'::regclass) THEN
    EXECUTE 'DROP POLICY profiles_select_own ON public.profiles';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'profiles_update_own' AND polrelid = 'public.profiles'::regclass) THEN
    EXECUTE 'DROP POLICY profiles_update_own ON public.profiles';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'profiles_insert_own' AND polrelid = 'public.profiles'::regclass) THEN
    EXECUTE 'DROP POLICY profiles_insert_own ON public.profiles';
  END IF;
END
$$;

CREATE POLICY profiles_select_own
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY profiles_update_own
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY profiles_insert_own
  ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Ensure no client-facing policies exist on reserved_emails
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT polname FROM pg_policy WHERE polrelid = 'public.reserved_emails'::regclass LOOP
    EXECUTE format('DROP POLICY %I ON public.reserved_emails', r.polname);
  END LOOP;
END
$$;

-- 5) Backfill: set is_creator for existing profiles that match reserved_emails
UPDATE public.profiles p
SET is_creator = true
FROM public.reserved_emails r
WHERE lower(p.email) = lower(r.email)
  AND (p.is_creator IS DISTINCT FROM true);

-- 6) Optional: recompute is_creator for all profiles (uncomment if needed)
-- UPDATE public.profiles p
-- SET is_creator = EXISTS (
--   SELECT 1 FROM public.reserved_emails r WHERE lower(r.email) = lower(p.email)
-- );

-- End of migration
