# User Data API - Personality Presets

**Endpoint:** `/api/user/data`  
**Last Updated:** October 3, 2025  
**Version:** 1.1.0 (Added personality_preset support)

---

## Overview

The User Data API has been extended to support **AI Personality Presets**, allowing users to customize AI behavior through curated personality styles or custom instructions.

### What's New in v1.1.0

- ✅ Added `personality_preset` field to user preferences
- ✅ Enhanced validation for personality presets
- ✅ Backward compatible with existing system_prompt field
- ✅ Layered prompt system support

---

## GET /api/user/data

Retrieve complete user profile including personality preferences.

### Request

```bash
GET /api/user/data
Authorization: Bearer <token>
# Or authenticated via Supabase cookies
```

### Response

**Status:** 200 OK

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "full_name": "John Doe",
  "avatar_url": "https://example.com/avatar.jpg",
  "subscription_tier": "pro",
  "account_type": "user",
  "credits": 1000,
  "preferences": {
    "model": {
      "default_model": "anthropic/claude-3.5-sonnet",
      "temperature": 0.7,
      "personality_preset": "witty",
      "system_prompt": "You are an expert in finance and economics."
    },
    "ui": {
      "theme": "dark",
      "sidebar_width": 280,
      "code_highlighting": true
    },
    "session": {
      "max_history": 10,
      "auto_title": true,
      "save_anonymous": false
    }
  },
  "available_models": [
    {
      "model_id": "anthropic/claude-3.5-sonnet",
      "model_name": "Claude 3.5 Sonnet",
      "daily_limit": 100,
      "monthly_limit": 3000
    }
  ],
  "usage_stats": {
    "today": {
      "messages_sent": 25,
      "total_tokens": 15000,
      "sessions_created": 3
    },
    "all_time": {
      "total_messages": 500,
      "total_tokens": 300000,
      "sessions_created": 50
    }
  }
}
```

### New Fields

#### `preferences.model.personality_preset`

- **Type:** `string | null`
- **Description:** Selected personality preset key or null for no preset
- **Valid Values:** `"helpful"`, `"professional"`, `"creative"`, `"concise"`, `"empathetic"`, `"technical"`, `"socratic"`, `"witty"`, or `null`
- **Default:** `null` (no preset selected)

**Example Values:**

```json
// With preset
"personality_preset": "witty"

// No preset (uses only system_prompt)
"personality_preset": null
```

---

## PUT /api/user/data

Update user preferences including personality preset.

### Request

```bash
PUT /api/user/data
Content-Type: application/json
Authorization: Bearer <token>
```

**Body:**

```json
{
  "preferences": {
    "model": {
      "personality_preset": "witty",
      "system_prompt": "You are an expert in finance and economics.",
      "temperature": 0.8
    }
  }
}
```

### Validation Rules

#### Personality Preset Validation

**Rule 1: Valid Preset Key or Null**

```typescript
// Valid
"personality_preset": "witty"
"personality_preset": null

// Invalid
"personality_preset": "invalid_key" // ❌ Not a valid preset
```

**Rule 2: Length Requirements (if custom text instead of key)**

- **Minimum:** 10 characters (if not using preset key)
- **Maximum:** 2000 characters
- **Trimming:** Leading/trailing whitespace removed

**Rule 3: Content Safety**

- ❌ HTML/script tags removed: `<script>`, `<iframe>`, `<object>`, `<embed>`
- ❌ Event handlers removed: `onclick=`, `onerror=`, etc.
- ❌ Control characters removed: ASCII 0-31, 127

### Response

**Success (200 OK):**

```json
{
  "success": true,
  "profile": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "preferences": {
      "model": {
        "personality_preset": "witty",
        "system_prompt": "You are an expert in finance and economics.",
        "temperature": 0.8
      }
    }
  }
}
```

**Validation Error (400 Bad Request):**

```json
{
  "error": "Invalid personality preset: not_a_valid_key"
}
```

```json
{
  "error": "Personality preset must be at least 10 characters if provided"
}
```

```json
{
  "error": "Personality preset cannot exceed 2000 characters"
}
```

---

## Personality Preset Keys

### Available Presets

| Key            | Label                          | Description                                          |
| -------------- | ------------------------------ | ---------------------------------------------------- |
| `helpful`      | 😊 Helpful & Friendly          | Warm, friendly, optimistic communication             |
| `professional` | 💼 Professional & Businesslike | Formal, precise, businesslike tone                   |
| `creative`     | 🎨 Creative & Playful          | Imaginative, enthusiastic, outside-the-box           |
| `concise`      | ⚡ Concise & Direct            | Brief, to-the-point, minimal elaboration             |
| `empathetic`   | 💚 Empathetic & Supportive     | Understanding, compassionate, emotionally aware      |
| `technical`    | 🔬 Technical & Precise         | Detailed, accurate, technical terminology            |
| `socratic`     | 🤔 Socratic Teacher            | Guides through questions, develops critical thinking |
| `witty`        | 😄 Witty & Clever              | Humorous, wordplay, clever observations              |

### Preset Details API

For full preset details including system prompts, use the constants:

```typescript
import {
  PERSONALITY_PRESETS,
  getPersonalityPrompt,
} from "@/lib/constants/personalityPresets";

// Get full preset object
const preset = PERSONALITY_PRESETS["witty"];
// {
//   key: "witty",
//   label: "Witty & Clever",
//   description: "Humorous, enjoys wordplay...",
//   icon: "😄",
//   systemPrompt: "You are a witty AI assistant..."
// }

// Get just the system prompt
const prompt = getPersonalityPrompt("witty");
// "You are a witty AI assistant. Use clever wordplay..."
```

---

## Usage Examples

### Example 1: Set Personality Preset Only

```bash
curl -X PUT https://api.yourapp.com/api/user/data \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "preferences": {
      "model": {
        "personality_preset": "professional"
      }
    }
  }'
```

### Example 2: Set Both Preset and Custom Prompt

```bash
curl -X PUT https://api.yourapp.com/api/user/data \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "preferences": {
      "model": {
        "personality_preset": "technical",
        "system_prompt": "You are an expert in machine learning and data science with 10+ years experience."
      }
    }
  }'
```

### Example 3: Remove Personality Preset

```bash
curl -X PUT https://api.yourapp.com/api/user/data \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "preferences": {
      "model": {
        "personality_preset": null
      }
    }
  }'
```

### Example 4: Update Multiple Preferences

```bash
curl -X PUT https://api.yourapp.com/api/user/data \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "preferences": {
      "model": {
        "personality_preset": "witty",
        "system_prompt": "Expert in Python programming",
        "temperature": 0.7,
        "default_model": "anthropic/claude-3.5-sonnet"
      },
      "ui": {
        "theme": "dark"
      }
    }
  }'
```

---

## How Personality Presets Work

### Layered Prompt System

When a chat request is made, the system combines prompts in this order:

```
1. Root System Prompt (always included)
   ↓
2. Personality Preset (if set)
   ↓
3. Custom System Prompt (if set)
   ↓
Final Combined Prompt → Sent to LLM
```

**Example:**

User settings:

```json
{
  "personality_preset": "witty",
  "system_prompt": "You are an expert in Python programming"
}
```

What the LLM receives:

```json
[
  {
    "role": "system",
    "content": "You are YourBrand AI assistant with strong capabilities..."
  },
  {
    "role": "system",
    "content": "You are a witty AI assistant. Use clever wordplay, humor..."
  },
  {
    "role": "system",
    "content": "CUSTOM: You are an expert in Python programming"
  },
  {
    "role": "user",
    "content": "How do I use decorators?"
  }
]
```

---

## Backward Compatibility

### Existing Users

- Existing users have `personality_preset: null` by default
- Their `system_prompt` continues to work as before
- No migration or action required

### Legacy API Format

The old format is still supported for backward compatibility:

**Old Format (still works):**

```json
{
  "systemPrompt": "Custom instructions..."
}
```

**New Format (recommended):**

```json
{
  "preferences": {
    "model": {
      "system_prompt": "Custom instructions...",
      "personality_preset": "witty"
    }
  }
}
```

---

## Error Handling

### Common Errors

#### Invalid Preset Key

**Request:**

```json
{
  "preferences": {
    "model": {
      "personality_preset": "not_a_valid_preset"
    }
  }
}
```

**Response (400):**

```json
{
  "error": "Invalid personality preset: not_a_valid_preset"
}
```

#### Text Too Short

**Request:**

```json
{
  "preferences": {
    "model": {
      "personality_preset": "short"
    }
  }
}
```

**Response (400):**

```json
{
  "error": "Personality preset must be at least 10 characters if provided"
}
```

#### Text Too Long

**Request:**

```json
{
  "preferences": {
    "model": {
      "personality_preset": "A very long text that exceeds 2000 characters..."
    }
  }
}
```

**Response (400):**

```json
{
  "error": "Personality preset cannot exceed 2000 characters"
}
```

---

## Rate Limiting

Personality preset updates are subject to the same rate limits as other preference updates:

- **Tier C (CRUD operations):** 50/200/1000/2000 requests/hour (anonymous/free/pro/enterprise)
- **Endpoint:** `/api/user/data` classified as Tier C

See [Rate Limiting Documentation](/docs/architecture/redis-rate-limiting.md) for details.

---

## Security Considerations

### Input Sanitization

All personality preset text (if custom) is sanitized:

1. **XSS Prevention:** HTML tags and event handlers removed
2. **Control Characters:** ASCII control characters stripped
3. **Length Validation:** Enforced 10-2000 character limit
4. **Whitespace Trimming:** Leading/trailing spaces removed

### Authentication Required

- All requests must be authenticated
- Uses Supabase cookies or Bearer token
- Row-level security enforced at database level

---

## TypeScript Types

### UserProfile Interface

```typescript
interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  system_prompt: string;
  personality_preset: string | null; // NEW
  subscription_tier: "free" | "pro" | "enterprise";
  account_type: "user" | "admin";
  // ... other fields
}
```

### UserPreferences Interface

```typescript
interface UserPreferences {
  model: {
    default_model?: string;
    temperature?: number;
    system_prompt?: string;
    personality_preset?: string | null; // NEW
  };
  ui?: {
    theme?: "light" | "dark";
    // ... other UI preferences
  };
  session?: {
    max_history?: number;
    // ... other session preferences
  };
}
```

### PersonalityPresetKey Type

```typescript
type PersonalityPresetKey =
  | "helpful"
  | "professional"
  | "creative"
  | "concise"
  | "empathetic"
  | "technical"
  | "socratic"
  | "witty";
```

---

## Related Documentation

- [Personality Presets User Guide](/docs/features/personality-presets.md)
- [Architecture Overview](/docs/architecture/personality-presets-system.md)
- [User Settings Guide](/docs/user-settings-guide.md)
- [Rate Limiting](/docs/architecture/redis-rate-limiting.md)

---

## Migration Notes

### Database Changes

**Migration 1 (20251002000000):** Add personality_preset column

```sql
ALTER TABLE public.profiles
ADD COLUMN personality_preset TEXT;
```

**Migration 2 (20251003000000):** Fix get_user_complete_profile function

```sql
-- Updated function to include personality_preset in SELECT and RETURN
```

### API Changes

**Version 1.0.0 → 1.1.0:**

- Added `personality_preset` field to GET response
- Added `personality_preset` validation to PUT request
- No breaking changes (fully backward compatible)

---

**Last Updated:** October 3, 2025  
**API Version:** 1.1.0  
**Status:** Production Ready
