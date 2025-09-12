-- Rollback: Restore separate permissive policies per action as originally defined.
-- Scope: public.message_token_costs (SELECT, INSERT), public.profiles (SELECT, UPDATE)

BEGIN;

-- message_token_costs: SELECT rollback
DO $$
BEGIN
  -- Drop consolidated policy if present
  IF EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='message_token_costs' AND p.polname='View message costs') THEN
    EXECUTE 'DROP POLICY "View message costs" ON public.message_token_costs';
  END IF;

  -- Recreate originals (idempotent via IF NOT EXISTS pattern)
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
                 WHERE n.nspname='public' AND c.relname='message_token_costs' AND p.polname='Users can view their own message costs') THEN
    EXECUTE 'CREATE POLICY "Users can view their own message costs" ON public.message_token_costs FOR SELECT USING ((select auth.uid()) = user_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
                 WHERE n.nspname='public' AND c.relname='message_token_costs' AND p.polname='Admins can view all message costs') THEN
    EXECUTE 'CREATE POLICY "Admins can view all message costs" ON public.message_token_costs FOR SELECT USING (public.is_admin((select auth.uid())))';
  END IF;
END $$;

-- message_token_costs: INSERT rollback
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='message_token_costs' AND p.polname='Insert message costs') THEN
    EXECUTE 'DROP POLICY "Insert message costs" ON public.message_token_costs';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
                 WHERE n.nspname='public' AND c.relname='message_token_costs' AND p.polname='Users can insert their own message costs') THEN
    EXECUTE 'CREATE POLICY "Users can insert their own message costs" ON public.message_token_costs FOR INSERT WITH CHECK ((select auth.uid()) = user_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
                 WHERE n.nspname='public' AND c.relname='message_token_costs' AND p.polname='Admins can insert any message costs') THEN
    EXECUTE 'CREATE POLICY "Admins can insert any message costs" ON public.message_token_costs FOR INSERT WITH CHECK (public.is_admin((select auth.uid())))';
  END IF;
END $$;

-- profiles: SELECT rollback
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='profiles' AND p.polname='View profiles') THEN
    EXECUTE 'DROP POLICY "View profiles" ON public.profiles';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
                 WHERE n.nspname='public' AND c.relname='profiles' AND p.polname='Users can view their own profile') THEN
    EXECUTE 'CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING ((select auth.uid()) = id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
                 WHERE n.nspname='public' AND c.relname='profiles' AND p.polname='Admins can view any profile') THEN
    EXECUTE 'CREATE POLICY "Admins can view any profile" ON public.profiles FOR SELECT USING (public.is_admin((select auth.uid())))';
  END IF;
END $$;

-- profiles: UPDATE rollback
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='profiles' AND p.polname='Update profiles') THEN
    EXECUTE 'DROP POLICY "Update profiles" ON public.profiles';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
                 WHERE n.nspname='public' AND c.relname='profiles' AND p.polname='Users can update their own profile') THEN
    EXECUTE 'CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING ((select auth.uid()) = id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
                 WHERE n.nspname='public' AND c.relname='profiles' AND p.polname='Admins can update any profile') THEN
    EXECUTE 'CREATE POLICY "Admins can update any profile" ON public.profiles FOR UPDATE USING (public.is_admin((select auth.uid())))';
  END IF;
END $$;

COMMIT;
