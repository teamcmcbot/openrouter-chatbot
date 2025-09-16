-- Purpose: Consolidate multiple permissive policies into a single policy per action to reduce evaluation overhead.
-- Scope: public.message_token_costs (SELECT, INSERT), public.profiles (SELECT, UPDATE)
-- Behavior: Identical semantics via OR-combination. Keeps (select auth.uid()) wrappers.
-- Safety: Idempotent; skips if consolidated policy already matches target expressions.

BEGIN;

-- message_token_costs: SELECT consolidation
DO $$
DECLARE
  using_users text := '((select auth.uid()) = user_id)';
  using_admins text := '(public.is_admin((select auth.uid())))';
  using_combined text := '(' || using_admins || ' OR ' || using_users || ')';
  existing text;
BEGIN
  SELECT pg_get_expr(p.polqual, p.polrelid)
    INTO existing
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname='public' AND c.relname='message_token_costs' AND p.polcmd='r'
    AND p.polname = 'View message costs';

  IF existing IS DISTINCT FROM using_combined THEN
    -- Create/Replace via drop-and-create to ensure single policy
    IF EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
               WHERE n.nspname='public' AND c.relname='message_token_costs' AND p.polname='View message costs') THEN
      EXECUTE 'DROP POLICY "View message costs" ON public.message_token_costs';
    END IF;

    EXECUTE 'CREATE POLICY "View message costs" ON public.message_token_costs FOR SELECT USING ' || using_combined;

    -- Drop redundant original policies if present
  IF EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public' AND c.relname='message_token_costs' AND p.polname='Users can view their own message costs') THEN
      EXECUTE 'DROP POLICY "Users can view their own message costs" ON public.message_token_costs';
    END IF;
  IF EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public' AND c.relname='message_token_costs' AND p.polname='Admins can view all message costs') THEN
      EXECUTE 'DROP POLICY "Admins can view all message costs" ON public.message_token_costs';
    END IF;
  END IF;
END $$;

-- message_token_costs: INSERT consolidation
DO $$
DECLARE
  check_users text := '((select auth.uid()) = user_id)';
  check_admins text := '(public.is_admin((select auth.uid())))';
  check_combined text := '(' || check_admins || ' OR ' || check_users || ')';
  existing text;
BEGIN
  SELECT pg_get_expr(p.polwithcheck, p.polrelid)
    INTO existing
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname='public' AND c.relname='message_token_costs' AND p.polcmd='a'
    AND p.polname = 'Insert message costs';

  IF existing IS DISTINCT FROM check_combined THEN
    IF EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
               WHERE n.nspname='public' AND c.relname='message_token_costs' AND p.polname='Insert message costs') THEN
      EXECUTE 'DROP POLICY "Insert message costs" ON public.message_token_costs';
    END IF;

    EXECUTE 'CREATE POLICY "Insert message costs" ON public.message_token_costs FOR INSERT WITH CHECK ' || check_combined;

  IF EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public' AND c.relname='message_token_costs' AND p.polname='Users can insert their own message costs') THEN
      EXECUTE 'DROP POLICY "Users can insert their own message costs" ON public.message_token_costs';
    END IF;
  IF EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public' AND c.relname='message_token_costs' AND p.polname='Admins can insert any message costs') THEN
      EXECUTE 'DROP POLICY "Admins can insert any message costs" ON public.message_token_costs';
    END IF;
  END IF;
END $$;

-- profiles: SELECT consolidation
DO $$
DECLARE
  using_users text := '((select auth.uid()) = id)';
  using_admins text := '(public.is_admin((select auth.uid())))';
  using_combined text := '(' || using_admins || ' OR ' || using_users || ')';
  existing text;
BEGIN
  SELECT pg_get_expr(p.polqual, p.polrelid)
    INTO existing
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname='public' AND c.relname='profiles' AND p.polcmd='r'
    AND p.polname = 'View profiles';

  IF existing IS DISTINCT FROM using_combined THEN
    IF EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
               WHERE n.nspname='public' AND c.relname='profiles' AND p.polname='View profiles') THEN
      EXECUTE 'DROP POLICY "View profiles" ON public.profiles';
    END IF;

    EXECUTE 'CREATE POLICY "View profiles" ON public.profiles FOR SELECT USING ' || using_combined;

  IF EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public' AND c.relname='profiles' AND p.polname='Users can view their own profile') THEN
      EXECUTE 'DROP POLICY "Users can view their own profile" ON public.profiles';
    END IF;
  IF EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public' AND c.relname='profiles' AND p.polname='Admins can view any profile') THEN
      EXECUTE 'DROP POLICY "Admins can view any profile" ON public.profiles';
    END IF;
  END IF;
END $$;

-- profiles: UPDATE consolidation
DO $$
DECLARE
  using_users text := '((select auth.uid()) = id)';
  using_admins text := '(public.is_admin((select auth.uid())))';
  using_combined text := '(' || using_admins || ' OR ' || using_users || ')';
  existing text;
BEGIN
  SELECT pg_get_expr(p.polqual, p.polrelid)
    INTO existing
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname='public' AND c.relname='profiles' AND p.polcmd='w'
    AND p.polname = 'Update profiles';

  IF existing IS DISTINCT FROM using_combined THEN
    IF EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
               WHERE n.nspname='public' AND c.relname='profiles' AND p.polname='Update profiles') THEN
      EXECUTE 'DROP POLICY "Update profiles" ON public.profiles';
    END IF;

    EXECUTE 'CREATE POLICY "Update profiles" ON public.profiles FOR UPDATE USING ' || using_combined || ' WITH CHECK ' || using_combined;

  IF EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public' AND c.relname='profiles' AND p.polname='Users can update their own profile') THEN
      EXECUTE 'DROP POLICY "Users can update their own profile" ON public.profiles';
    END IF;
  IF EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public' AND c.relname='profiles' AND p.polname='Admins can update any profile') THEN
      EXECUTE 'DROP POLICY "Admins can update any profile" ON public.profiles';
    END IF;
  END IF;
END $$;

COMMIT;
