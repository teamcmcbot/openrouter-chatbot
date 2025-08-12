-- Patch: RLS fix for message_token_costs INSERT
-- Date: 2025-08-12
-- Reason: Initial implementation only created SELECT policies; trigger-based INSERT failed under RLS.

-- Add INSERT policies so authenticated users can insert their own cost rows and admins can insert any.
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename='message_token_costs' AND policyname='Users can insert their own message costs'
    ) THEN
        CREATE POLICY "Users can insert their own message costs" ON public.message_token_costs
            FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename='message_token_costs' AND policyname='Admins can insert any message costs'
    ) THEN
        CREATE POLICY "Admins can insert any message costs" ON public.message_token_costs
            FOR INSERT WITH CHECK (public.is_admin(auth.uid()));
    END IF;
END $$;

-- (No UPDATE/DELETE policies needed yet; system does not modify or remove cost rows.)
