# Database Setup Instructions

This directory contains all SQL scripts needed to set up the Supabase database for the OpenRouter Chatbot application.

## 🚀 **Quick Setup (Human Coordinator)**

Execute these SQL scripts **in order** in your Supabase SQL Editor:

1. **Phase 1**: `01-user-profiles.sql` - User profile system
2. **Phase 2**: `02-chat-tables.sql` - Chat history tables
3. **Phase 3**: `03-user-enhancements.sql` - User management features
4. **Phase 4**: `04-preferences.sql` - User preferences and settings

## 📂 **File Structure**

```
database/
├── README.md                     # This file
├── 01-user-profiles.sql          # Phase 1: User profiles with RLS
├── 02-chat-tables.sql            # Phase 2: Chat sessions and messages
├── 03-user-enhancements.sql      # Phase 3: Credits, subscriptions, usage
├── 04-preferences.sql            # Phase 4: Model preferences, settings
├── functions/                    # Custom PostgreSQL functions
│   ├── update_user_profile.sql   # Profile update with validation
│   └── cleanup_old_sessions.sql  # Maintenance functions
└── policies/                     # Additional RLS policies
    ├── chat_policies.sql         # Chat data access policies
    └── user_policies.sql         # User data access policies
```

## 🔒 **Security Features**

- **Row Level Security (RLS)**: Users can only access their own data
- **Policy-based Access**: Granular control over data operations
- **Data Isolation**: Complete separation between user accounts
- **Audit Trails**: Track user actions and data changes

## 📊 **Database Schema Overview**

### **Phase 1 Tables**

- `profiles` - User profile data and basic preferences

### **Phase 2 Tables**

- `chat_sessions` - Chat conversation metadata
- `chat_messages` - Individual messages within conversations

### **Phase 3 Tables**

- Enhanced `profiles` with credits, subscription tiers, usage stats

### **Phase 4 Tables**

- Completed `profiles` with model preferences and UI settings

## 🛠️ **Manual Execution Steps**

1. Open [Supabase Dashboard](https://app.supabase.com) → Your Project
2. Navigate to **SQL Editor**
3. Create a new query
4. Copy and paste the content of each SQL file
5. Click **Run** to execute
6. Verify tables are created in **Table Editor**

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

## 🔧 **Troubleshooting**

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
-- WARNING: This will delete ALL data
DROP TABLE IF EXISTS chat_messages CASCADE;
DROP TABLE IF EXISTS chat_sessions CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TYPE IF EXISTS subscription_tier CASCADE;
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
