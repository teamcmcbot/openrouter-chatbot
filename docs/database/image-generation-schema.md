# Image Generation Database Schema

Documentation for database schema extensions supporting AI image generation feature.

## Overview

The image generation feature extends the existing database schema with new fields for tracking image generation costs, tokens, and metadata. These extensions maintain compatibility with existing queries while providing detailed analytics for image generation usage.

## Schema Extensions

### Chat Messages Table

New columns added to the `chat_messages` table to track image generation metrics:

```sql
-- Add image generation tracking columns
ALTER TABLE chat_messages
ADD COLUMN output_image_tokens INTEGER DEFAULT 0,
ADD COLUMN output_image_costs DECIMAL(10,6) DEFAULT 0.0;

-- Add index for cost queries
CREATE INDEX idx_chat_messages_image_costs
ON chat_messages (output_image_costs)
WHERE output_image_costs > 0;

-- Add index for analytics queries
CREATE INDEX idx_chat_messages_image_usage
ON chat_messages (user_id, created_at, output_image_tokens)
WHERE output_image_tokens > 0;
```

#### Column Specifications

| Column                | Type            | Default | Description                                |
| --------------------- | --------------- | ------- | ------------------------------------------ |
| `output_image_tokens` | `INTEGER`       | `0`     | Number of tokens used for image generation |
| `output_image_costs`  | `DECIMAL(10,6)` | `0.0`   | Cost in USD for image generation           |

#### Usage Patterns

```sql
-- Insert message with image generation data
INSERT INTO chat_messages (
  id, session_id, role, content, model,
  total_tokens, input_tokens, output_tokens,
  output_image_tokens, output_image_costs,
  message_timestamp, elapsed_ms
) VALUES (
  $1, $2, 'assistant', $3, $4,
  $5, $6, $7,
  $8,  -- Image tokens from OpenRouter
  $9,  -- Image costs in USD
  NOW(), $10
);

-- Query messages with image generation
SELECT
  m.*,
  CASE WHEN m.output_image_tokens > 0 THEN true ELSE false END as has_images
FROM chat_messages m
WHERE m.session_id = $1
  AND m.role = 'assistant'
  AND m.output_image_tokens > 0
ORDER BY m.message_timestamp;
```

### Chat Attachments Table

The existing `chat_attachments` table handles AI-generated images without schema changes:

```sql
-- Example generated image attachment record
INSERT INTO chat_attachments (
  id, user_id, session_id, message_id,
  kind, mime, size_bytes,
  storage_bucket, storage_path,
  draft_id, status,
  created_at, updated_at
) VALUES (
  'att_abc123', 'user_456', 'session_789', 'msg_101',
  'image', 'image/png', 2048576,
  'attachments-images', 'user456/2024/01/15/assistant/session789/msg101/uuid.png',
  NULL,  -- AI images are not drafts
  'ready',
  NOW(), NOW()
);
```

#### Generated Image Characteristics

- **kind**: Always `'image'` for generated images
- **draft_id**: Always `NULL` (not draft attachments)
- **storage_path**: Pattern: `{userId}/{yyyy}/{mm}/{dd}/assistant/{sessionId}/{messageId}/{uuid}.{ext}`
- **status**: Always `'ready'` after successful generation

### Usage Costs Table

Extended to track image generation costs separately:

```sql
-- Enhanced usage costs tracking
INSERT INTO usage_costs (
  user_id, model, session_id, message_id,
  input_tokens, output_tokens, total_tokens,
  output_image_tokens, output_image_costs,
  total_cost_usd, created_at
) VALUES (
  $1, $2, $3, $4,
  $5, $6, $7,
  $8,  -- Image-specific tokens
  $9,  -- Image-specific costs
  $10, -- Combined text + image costs
  NOW()
);
```

## Query Patterns

### Analytics Queries

#### Daily Image Generation Statistics

```sql
SELECT
  DATE_TRUNC('day', created_at) as date,
  COUNT(*) FILTER (WHERE output_image_tokens > 0) as image_requests,
  SUM(output_image_tokens) as total_image_tokens,
  SUM(output_image_costs) as total_image_costs,
  AVG(output_image_costs) FILTER (WHERE output_image_costs > 0) as avg_cost_per_image
FROM chat_messages
WHERE created_at >= NOW() - INTERVAL '30 days'
  AND role = 'assistant'
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY date;
```

#### Top Image Generation Models

```sql
SELECT
  model,
  COUNT(*) FILTER (WHERE output_image_tokens > 0) as image_requests,
  SUM(output_image_tokens) as total_tokens,
  SUM(output_image_costs) as total_costs,
  AVG(output_image_tokens) FILTER (WHERE output_image_tokens > 0) as avg_tokens_per_image
FROM chat_messages
WHERE output_image_tokens > 0
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY model
ORDER BY total_costs DESC;
```

#### User Image Generation Usage

```sql
SELECT
  u.email,
  u.subscription_tier,
  COUNT(*) FILTER (WHERE m.output_image_tokens > 0) as image_requests,
  SUM(m.output_image_costs) as total_image_costs,
  MAX(m.created_at) as last_image_generation
FROM users u
LEFT JOIN chat_messages m ON m.user_id = u.id
  AND m.created_at >= NOW() - INTERVAL '30 days'
WHERE u.subscription_tier IN ('pro', 'enterprise')
GROUP BY u.id, u.email, u.subscription_tier
HAVING COUNT(*) FILTER (WHERE m.output_image_tokens > 0) > 0
ORDER BY total_image_costs DESC;
```

### Message Retrieval with Images

#### Session Messages with Image Metadata

```sql
SELECT
  m.id,
  m.role,
  m.content,
  m.model,
  m.total_tokens,
  m.output_image_tokens,
  m.output_image_costs,
  m.message_timestamp,
  -- Aggregate attached images
  COALESCE(
    JSON_AGG(
      JSON_BUILD_OBJECT(
        'attachmentId', a.id,
        'mimeType', a.mime,
        'sizeBytes', a.size_bytes,
        'storagePath', a.storage_path
      ) ORDER BY a.created_at
    ) FILTER (WHERE a.id IS NOT NULL),
    '[]'::json
  ) as images
FROM chat_messages m
LEFT JOIN chat_attachments a ON a.message_id = m.id
  AND a.kind = 'image'
  AND a.status = 'ready'
WHERE m.session_id = $1
GROUP BY m.id, m.role, m.content, m.model, m.total_tokens,
         m.output_image_tokens, m.output_image_costs, m.message_timestamp
ORDER BY m.message_timestamp;
```

#### Cost Breakdown Query

```sql
SELECT
  m.session_id,
  s.title as session_title,
  COUNT(*) as total_messages,
  COUNT(*) FILTER (WHERE m.output_image_tokens > 0) as messages_with_images,
  SUM(m.total_tokens) as total_text_tokens,
  SUM(m.output_image_tokens) as total_image_tokens,
  SUM(uc.total_cost_usd - uc.output_image_costs) as text_costs,
  SUM(uc.output_image_costs) as image_costs,
  SUM(uc.total_cost_usd) as total_costs
FROM chat_messages m
JOIN chat_sessions s ON s.id = m.session_id
LEFT JOIN usage_costs uc ON uc.message_id = m.id
WHERE m.user_id = $1
  AND m.created_at >= NOW() - INTERVAL '30 days'
GROUP BY m.session_id, s.title
HAVING SUM(uc.output_image_costs) > 0
ORDER BY total_costs DESC;
```

## Performance Considerations

### Indexing Strategy

```sql
-- Optimized indexes for image generation queries
CREATE INDEX CONCURRENTLY idx_chat_messages_user_image_costs
ON chat_messages (user_id, created_at DESC)
WHERE output_image_costs > 0;

CREATE INDEX CONCURRENTLY idx_chat_messages_model_image_usage
ON chat_messages (model, created_at DESC)
WHERE output_image_tokens > 0;

CREATE INDEX CONCURRENTLY idx_chat_attachments_image_lookup
ON chat_attachments (message_id, kind, status)
WHERE kind = 'image';
```

### Query Optimization

#### Efficient Cost Tracking

```sql
-- Use partial indexes for better performance
EXPLAIN (ANALYZE, BUFFERS)
SELECT SUM(output_image_costs)
FROM chat_messages
WHERE user_id = $1
  AND created_at >= DATE_TRUNC('month', NOW())
  AND output_image_costs > 0;
```

#### Attachment Joining

```sql
-- Optimized image attachment retrieval
SELECT m.*,
       a.id as attachment_id,
       a.storage_path
FROM chat_messages m
JOIN chat_attachments a USING (message_id)
WHERE m.session_id = $1
  AND a.kind = 'image'
  AND a.status = 'ready'
ORDER BY m.message_timestamp, a.created_at;
```

## Data Migration

### Adding New Columns

```sql
-- Safe migration for production
BEGIN;

-- Add columns with defaults
ALTER TABLE chat_messages
ADD COLUMN IF NOT EXISTS output_image_tokens INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS output_image_costs DECIMAL(10,6) DEFAULT 0.0;

-- Verify no existing data conflicts
SELECT COUNT(*) FROM chat_messages
WHERE output_image_tokens IS NULL
   OR output_image_costs IS NULL;

-- Add constraints after data verification
ALTER TABLE chat_messages
ADD CONSTRAINT chk_output_image_tokens_non_negative
CHECK (output_image_tokens >= 0);

ALTER TABLE chat_messages
ADD CONSTRAINT chk_output_image_costs_non_negative
CHECK (output_image_costs >= 0);

COMMIT;
```

### Backfilling Historical Data

```sql
-- Identify messages that may have generated images
SELECT m.id, m.content, COUNT(a.id) as image_count
FROM chat_messages m
JOIN chat_attachments a ON a.message_id = m.id
WHERE a.kind = 'image'
  AND a.storage_path LIKE '%/assistant/%'
  AND m.output_image_tokens = 0
GROUP BY m.id, m.content;

-- Update estimated costs for historical image generations
-- (This would require business logic to estimate costs)
```

## Monitoring & Maintenance

### Data Integrity Checks

```sql
-- Verify image token/cost consistency
SELECT
  COUNT(*) as inconsistent_records
FROM chat_messages
WHERE (output_image_tokens > 0 AND output_image_costs = 0)
   OR (output_image_tokens = 0 AND output_image_costs > 0);

-- Check attachment orphans
SELECT COUNT(*) as orphaned_images
FROM chat_attachments a
LEFT JOIN chat_messages m ON m.id = a.message_id
WHERE a.kind = 'image'
  AND a.storage_path LIKE '%/assistant/%'
  AND m.id IS NULL;
```

### Cleanup Procedures

```sql
-- Archive old cost data (retain 2 years)
DELETE FROM usage_costs
WHERE created_at < NOW() - INTERVAL '2 years'
  AND output_image_costs = 0;

-- Clean up failed image generations
DELETE FROM chat_attachments
WHERE kind = 'image'
  AND status = 'failed'
  AND created_at < NOW() - INTERVAL '7 days';
```

## Security Considerations

### Data Access Patterns

- Image costs are user-specific and require proper authorization
- Aggregate queries must respect user privacy
- Admin analytics should anonymize user data

### Storage Validation

```sql
-- Verify image attachments belong to correct user
SELECT a.*, m.user_id
FROM chat_attachments a
JOIN chat_messages m ON m.id = a.message_id
WHERE a.kind = 'image'
  AND a.storage_path NOT LIKE CONCAT(m.user_id::text, '/%');
```

This schema extension provides comprehensive tracking for image generation while maintaining performance and data integrity.
