-- Phase 1: User Profiles and Authentication Setup
-- Execute this in Supabase SQL Editor

-- =============================================================================
-- USER PROFILES TABLE
-- =============================================================================

-- Create user profiles table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    -- Primary key and user reference
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    
    -- Basic profile information
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    avatar_url TEXT,
    
    -- Basic preferences (Phase 1)
    default_model VARCHAR(100) DEFAULT 'deepseek/deepseek-r1-0528:free',
    temperature DECIMAL(3,2) DEFAULT 0.7 CHECK (temperature >= 0.0 AND temperature <= 2.0),
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    last_active TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- Index for fast profile lookups
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_last_active ON public.profiles(last_active);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

-- Enable RLS on profiles table
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own profile
CREATE POLICY "Users can view their own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

-- Policy: Users can update their own profile  
CREATE POLICY "Users can update their own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- Policy: Users can insert their own profile
CREATE POLICY "Users can insert their own profile" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Policy: Users can delete their own profile
CREATE POLICY "Users can delete their own profile" ON public.profiles
    FOR DELETE USING (auth.uid() = id);

-- =============================================================================
-- AUTOMATIC PROFILE CREATION FUNCTION
-- =============================================================================

-- Function to automatically create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        NEW.raw_user_meta_data->>'avatar_url'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- AUTOMATIC PROFILE UPDATE FUNCTION  
-- =============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Trigger to create profile on user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger to update updated_at on profile changes
DROP TRIGGER IF EXISTS on_profile_updated ON public.profiles;
CREATE TRIGGER on_profile_updated
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================

-- Check if tables were created successfully
DO $$
BEGIN
    -- Check if profiles table exists
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'profiles' AND table_schema = 'public') THEN
        RAISE EXCEPTION 'profiles table was not created successfully';
    END IF;
    
    -- Check if RLS is enabled
    IF NOT EXISTS (
        SELECT FROM pg_tables 
        WHERE tablename = 'profiles' 
        AND schemaname = 'public' 
        AND rowsecurity = true
    ) THEN
        RAISE EXCEPTION 'RLS is not enabled on profiles table';
    END IF;
    
    RAISE NOTICE 'Phase 1 database setup completed successfully!';
    RAISE NOTICE 'Tables created: profiles';
    RAISE NOTICE 'RLS policies: ✓ enabled and configured';
    RAISE NOTICE 'Auto-profile creation: ✓ trigger installed';
END $$;

-- =============================================================================
-- SAMPLE DATA FOR TESTING (OPTIONAL)
-- =============================================================================

-- Uncomment below to insert test data (only if you have test users)
/*
-- Example: Insert a test profile (replace with your actual user ID)
INSERT INTO public.profiles (id, email, full_name, default_model) 
VALUES (
    '00000000-0000-0000-0000-000000000000', -- Replace with real user ID
    'test@example.com',
    'Test User',
    'deepseek/deepseek-r1-0528:free'
) ON CONFLICT (id) DO NOTHING;
*/

-- =============================================================================
-- COMPLETION CHECKLIST
-- =============================================================================

/*
✅ Phase 1 Database Setup Checklist:

□ 1. Execute this SQL script in Supabase SQL Editor
□ 2. Verify "Phase 1 database setup completed successfully!" message appears
□ 3. Check Table Editor → profiles table exists with correct columns
□ 4. Test profile creation by signing in with Google OAuth
□ 5. Verify RLS policies in Authentication → Policies → profiles table
□ 6. Confirm user can only see their own profile data

After Phase 1 completion:
- ✅ Authentication system ready for testing
- ✅ User profiles auto-created on first sign-in  
- ✅ Data isolation between users enforced
- ⏳ Ready for Phase 2 (Chat History Tables)
*/
