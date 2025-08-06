# 🗃️ Database Setup Guide

## Overview

This directory contains the complete## 🧹 Clean Reset Available

If you need to completely reset your database to start fresh:

**Use:** `00-complete-reset.sql` - Removes all tables, functions, types, and triggers

⚠️ **WARNING:** This will delete ALL data. Only use this for a complete fresh start.ed database schema for the OpenRouter Chatbot. All previous fragmented SQL files have been consolidated into 4 comprehensive phases.

## 🚀 Quick Setup

Execute these SQL files **in order** in your Supabase SQL Editor:

### Phase 1: User Management

**File:** `01-complete-user-management.sql`

- ✅ User profiles with Google OAuth sync
- ✅ Activity logging and audit trails
- ✅ User tiers (free, pro, enterprise, admin)
- ✅ Credits and usage tracking
- ✅ Automatic profile creation/updates

### Phase 2: Chat History

**File:** `02-complete-chat-history.sql`

- ✅ Chat sessions and messages (TEXT ID support)
- ✅ Client-compatible IDs (e.g., `conv_1752734987703_j9spjufk8`)
- ✅ Row Level Security policies
- ✅ Bulk sync functions for API
- ✅ Automatic statistics tracking

### Phase 3: Advanced Features

**File:** `03-complete-user-enhancements.sql`

- ✅ Model access control by user tier
- ✅ Daily usage analytics
- ✅ UI and session preferences
- ✅ Rate limiting and cost tracking
- ✅ Comprehensive usage functions

### Phase 4: System Optimization

**File:** `04-complete-system-final.sql`

- ✅ Advanced preferences management
- ✅ System caching and performance
- ✅ Database health monitoring
- ✅ GDPR compliance (data export)
- ✅ Maintenance and cleanup functions

## 🔧 Key Features

### TEXT ID Support ✅

- **Problem Solved:** Database now accepts client-generated IDs like `"conv_1752734987703_j9spjufk8"`
- **No More UUID Errors:** Direct storage of conversation and message IDs
- **Client Compatibility:** Full sync support without ID conversion

### Enhanced Profile Sync ✅

- **Google OAuth Integration:** Automatic profile creation and updates
- **Activity Logging:** Complete audit trail of user actions
- **Tier Management:** Free, Pro, Enterprise, Admin user levels

### Model Access Control ✅

- **Tier-Based Access:** Different models for different user tiers
- **Rate Limiting:** Daily/monthly usage limits per model
- **Cost Tracking:** Token usage and cost calculation

### Complete API Support ✅

- **Bulk Sync:** `sync_user_conversations()` function
- **User Profiles:** `get_user_complete_profile()` function
- **Model Access:** `get_user_allowed_models()` function
- **Usage Tracking:** `track_user_usage()` function

## 🔍 Verification

After executing all phases, you should see:

```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Expected tables:
-- chat_messages
-- chat_sessions
-- model_access
-- profiles
-- system_cache
-- system_stats
-- user_activity_log
-- user_usage_daily
```

## 🧪 Testing

After setup, test the sync functionality:

1. **Create anonymous conversations** in your app
2. **Sign in with Google** - conversations should persist
3. **Check database** - data should sync with TEXT IDs
4. **No UUID errors** - sync should show `"synced": 2, "errors": 0`

## 🆘 Troubleshooting

### If you get UUID errors:

- ❌ You're using old schema files
- ✅ Use the new consolidated files (Phase 1-4)

### If profiles don't sync:

- Check that Google OAuth is configured in Supabase
- Verify triggers are installed with the new schema

### If sync fails:

- Check that TEXT ID support is enabled (Phase 2)
- Verify RLS policies are correctly applied

## 📋 Migration from Old Schema

If you have any existing data or tables:

1. **Complete Reset** (recommended for clean start):

   ```sql
   -- Copy and paste: 00-complete-reset.sql
   -- ✅ Removes all existing tables, functions, and types
   -- ⏱️ Expected: ~10 seconds
   -- ✅ Success: "Database completely reset! All tables, functions, types, and triggers removed."
   ```

2. **Execute new schema** (Phase 1-4 in order)
3. **Start fresh** with clean consolidated schema

## 🎯 Ready for Production

After executing all 4 phases:

- ✅ Your app's sync endpoint will work
- ✅ Conversations will persist across devices
- ✅ User tiers and model access are enforced
- ✅ Complete audit trail and analytics
- ✅ GDPR-compliant data export

**Your OpenRouter Chatbot database is production-ready! 🚀**

## 📂 **Current File Structure**

```
database/
├── README.md                          # This setup guide
├── 00-complete-reset.sql              # Complete database reset (if needed)
├── 01-complete-user-management.sql    # Phase 1: User system + Google OAuth
├── 02-complete-chat-history.sql       # Phase 2: Chat sessions + TEXT ID support
├── 03-complete-user-enhancements.sql  # Phase 3: User tiers + model access
├── 04-complete-system-final.sql       # Phase 4: System optimization + GDPR
├── deprecated/                        # Old fragmented files (ignore)
├── functions/                         # Optional utility functions
└── policies/                          # Optional advanced security
```

## 🏗️ **Prerequisites Setup**

Before running the database scripts, ensure you have:

### **1. Supabase Project Setup**

1. Create account at [app.supabase.com](https://app.supabase.com)
2. Create new project
3. Note your **Project URL** and **anon public key** from Settings → API

### **2. Google OAuth Configuration**

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create new project or select existing
3. Enable Google+ API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URIs:
   - Development: `http://localhost:3000/auth/callback`
   - Production: `https://yourdomain.com/auth/callback`

### **3. Supabase Auth Configuration**

1. In Supabase Dashboard → Authentication → Providers
2. Enable Google provider
3. Add your Google OAuth Client ID and Secret
4. Set redirect URLs to match your application URLs

### **4. Environment Variables**

Create `.env.local` in your project root:

```bash
NEXT_PUBLIC_SUPABASE_URL=your-project-url-here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

## 🔒 **Security Features**

- **Row Level Security (RLS)**: Users can only access their own data
- **Policy-based Access**: Granular control over data operations
- **Data Isolation**: Complete separation between user accounts
- **Audit Trails**: Track user actions and data changes

## 📊 **Database Schema Overview**

### **Phase 1: Authentication Foundation**

- **`profiles`** - User profiles with auto-creation and sync
- **Triggers** - Auto-profile creation on Google OAuth sign-in
- **RLS Policies** - Secure user data isolation

### **Phase 2: Chat History System**

- **`chat_sessions`** - Conversation metadata and tracking
- **`chat_messages`** - Individual messages with full content
- **Functions** - Migration helpers for localStorage → database sync
- **Indexes** - Performance-optimized queries for chat operations

### **Phase 3: User Management & Analytics**

- **`user_sessions`** - Session tracking and security monitoring
- **`user_activity_log`** - Complete audit trail for all actions
- **`user_model_access`** - Fine-grained model access control
- **`usage_tracking`** - Detailed usage analytics and billing data
- **Subscription System** - Free/Pro/Enterprise tier management

### **Phase 4: Complete Personalization**

- **`user_saved_prompts`** - Custom prompt library with sharing
- **`user_model_preferences`** - Per-model settings and configurations
- **`user_custom_themes`** - Personalized UI themes
- **Enhanced Profiles** - UI preferences, chat settings, privacy controls

### **Enhancement Features**

- **Auto-Sync Profiles** - Keeps user data current with Google account changes
- **Maintenance Functions** - Database health checks and cleanup utilities
- **Advanced Security** - Rate limiting, content filtering, audit trails

## 🛠️ **Step-by-Step Setup Guide**

### **Step 1: Core Database Setup**

1. Open [Supabase Dashboard](https://app.supabase.com) → Your Project
2. Navigate to **SQL Editor**
3. Create a new query for each phase

#### **Execute in Order:**

**Complete Reset (if needed):**

```sql
-- Copy and paste: 00-complete-reset.sql
-- ✅ Removes: all existing tables, functions, types, triggers
-- ⏱️ Expected: ~10 seconds
-- ✅ Success message: "Database completely reset!"
```

**Phase 1 - User Authentication:**

```sql
-- Copy and paste: 01-complete-user-management.sql
-- ✅ Creates: profiles table, RLS policies, auto-profile creation
-- ⏱️ Expected: ~30 seconds
-- ✅ Success message: "Phase 1 database setup completed successfully!"
```

**Phase 2 - Chat History:**

```sql
-- Copy and paste: 02-complete-chat-history.sql
-- ✅ Creates: chat_sessions, chat_messages, sync functions
-- ⏱️ Expected: ~45 seconds
-- ✅ Success message: "Phase 2 database setup completed successfully!"
```

**Phase 3 - User Management:**

```sql
-- Copy and paste: 03-complete-user-enhancements.sql
-- ✅ Creates: subscription system, analytics, access control
-- ⏱️ Expected: ~60 seconds
-- ✅ Success message: "Phase 3 database setup completed successfully!"
```

**Phase 4 - Personalization:**

```sql
-- Copy and paste: 04-complete-system-final.sql
-- ✅ Creates: complete user preferences, themes, prompts
-- ⏱️ Expected: ~45 seconds
-- ✅ Success message: "Phase 4 database setup completed successfully!"
```

### **Step 2: Optional Utilities**

**Database Maintenance Functions:**

```sql
-- Copy and paste: functions/maintenance.sql
-- ✅ Adds: Health checks, cleanup utilities, statistics
-- ⏱️ Expected: ~30 seconds
```

**Advanced Security Policies:**

```sql
-- Copy and paste: policies/enhanced_security.sql
-- ✅ Adds: Rate limiting, content filtering, audit controls
-- ⏱️ Expected: ~45 seconds
```

## ✅ **Verification Checklist**

After running each phase:

### **Phase 1 Verification**

- [ ] `profiles` table exists with proper columns
- [ ] RLS is enabled on `profiles` table
- [ ] User can insert/update their own profile
- [ ] User cannot access other users' profiles

### **Phase 2 Verification**

- [ ] `chat_sessions` and `chat_messages` tables exist
- [ ] Foreign key relationships are properly set up
- [ ] RLS policies prevent cross-user data access
- [ ] Indexes are created for performance

### **Phase 3 Verification**

- [ ] User enhancement columns added to `profiles`
- [ ] Default values set correctly
- [ ] Enum types created for subscription tiers

### **Phase 4 Verification**

- [ ] Model preference columns added
- [ ] JSONB columns for UI preferences work
- [ ] All constraints and defaults in place

## 🔧 **Troubleshooting & Validation**

### **Quick Health Check**

Run this query to verify your setup:

```sql
-- Database Health Check
SELECT
  'profiles' as table_name, count(*) as records FROM profiles
UNION ALL
SELECT
  'chat_sessions' as table_name, count(*) as records FROM chat_sessions
UNION ALL
SELECT
  'chat_messages' as table_name, count(*) as records FROM chat_messages
UNION ALL
SELECT
  'user_activity_log' as table_name, count(*) as records FROM user_activity_log;

-- ✅ Expected: All tables should exist with 0 records initially
```

### **Test Profile Creation**

After a user signs in with Google OAuth:

```sql
-- Verify auto-profile creation
SELECT id, email, full_name, avatar_url, created_at
FROM profiles
ORDER BY created_at DESC
LIMIT 5;

-- ✅ Expected: New profile should appear automatically
```

### **Common Issues & Solutions**

**❌ Error: "relation does not exist"**

- **Cause:** Phases executed out of order
- **Solution:** Re-run phases 1-4 in sequence

**❌ Error: "permission denied for table"**

- **Cause:** RLS policies not properly configured
- **Solution:** Re-run the specific phase that failed

**❌ Error: "function does not exist"**

- **Cause:** Missing prerequisite functions
- **Solution:** Ensure Phase 1 completed before other phases

**❌ Error: "syntax error near 'timestamp'"**

- **Cause:** Using old version of scripts
- **Solution:** Use updated scripts with 'message_timestamp'

### **Performance Verification**

```sql
-- Check indexes are created
SELECT schemaname, tablename, indexname
FROM pg_indexes
WHERE tablename IN ('profiles', 'chat_sessions', 'chat_messages', 'user_activity_log')
ORDER BY tablename, indexname;

-- ✅ Expected: Multiple indexes per table for performance
```

### **Security Validation**

```sql
-- Verify RLS is enabled
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE tablename IN ('profiles', 'chat_sessions', 'chat_messages', 'user_activity_log');

-- ✅ Expected: rowsecurity = true for all tables
```

### **Common Issues**

**"Insufficient permissions" Error:**

- Ensure you're logged in as the project owner
- Check that RLS policies allow the operation

**"Table already exists" Error:**

- Skip the CREATE TABLE statement
- Run only the missing parts (columns, indexes, policies)

**Foreign Key Violations:**

- Ensure parent tables exist before child tables
- Check that referenced columns have correct data types

### **Reset Instructions**

If you need to start over:

```sql
-- Copy and paste: 00-complete-reset.sql
-- WARNING: This will delete ALL data and reset everything
```

## 📞 **Support**

If you encounter issues:

1. Check the Supabase logs in Dashboard → Logs
2. Verify your RLS policies in Dashboard → Authentication → Policies
3. Review table structure in Dashboard → Table Editor
4. Contact the development team with error details

---

**Next Steps After Database Setup:**

- Agent will implement API endpoints for chat synchronization
- User profile auto-creation will be activated
- Chat history will sync between devices for authenticated users
