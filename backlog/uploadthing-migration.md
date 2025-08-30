# Image Attachments Architecture - UploadThing Migration Analysis

## Migration Feasibility Assessment

After analyzing the current Supabase Storage implementation and UploadThing's capabilities, here's a comprehensive migration analysis:

## UploadThing vs Current Implementation Comparison

### Key Differences

| Feature              | Current (Supabase Storage)           | UploadThing                                              |
| -------------------- | ------------------------------------ | -------------------------------------------------------- |
| **Storage Location** | Supabase bucket `attachments-images` | UploadThing CDN or BYO S3/R2                             |
| **URL Access**       | Signed URLs (5 min TTL)              | Public URLs (permanent) or private with paid tier        |
| **Upload Flow**      | Server processes file → Storage      | Client → UploadThing direct (server never touches bytes) |
| **Size Validation**  | Server-side                          | Both client and server hooks                             |
| **File Metadata**    | Stored in DB after upload            | Returned by UploadThing, then stored in DB               |
| **Cost**             | Part of Supabase plan                | Separate billing (2GB free, $10/100GB)                   |
| **Egress**           | Counted against Supabase limits      | Not metered on UploadThing plans                         |

## Migration Implementation Plan

### Phase 1: Infrastructure Setup

#### 1.1 Install Dependencies

```bash
npm install uploadthing @uploadthing/react
```

#### 1.2 Environment Variables

```env
UPLOADTHING_APP_ID=your_app_id
UPLOADTHING_SECRET=your_secret
# Keep existing Supabase vars for DB
```

### Phase 2: Backend API Changes

#### 2.1 Create UploadThing Router

```typescript
import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { createClient } from "@supabase/supabase-js";

const f = createUploadthing();

export const fileRouter = {
  chatImage: f({
    image: {
      maxFileSize: "10MB", // Will enforce tier-based in middleware
      maxFileCount: 1, // Upload one at a time, frontend manages 3 total
      acceptedFileTypes: ["image/png", "image/jpeg", "image/webp"],
    },
  })
    .middleware(async ({ req, files }) => {
      // Extract auth from request (UploadThing passes the original request)
      const authHeader = req.headers.get("authorization");
      const cookie = req.headers.get("cookie");

      // Validate user session using existing auth utilities
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      // Get user from cookie or header
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(
        authHeader?.replace("Bearer ", "") || extractTokenFromCookie(cookie)
      );

      if (!user) throw new UploadThingError("Unauthorized");

      // Get user profile for tier checking
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("subscription_tier")
        .eq("id", user.id)
        .single();

      // Enforce tier-based size limits
      const maxSize =
        profile?.subscription_tier === "free"
          ? 5 * 1024 * 1024
          : 10 * 1024 * 1024;

      files.forEach((file) => {
        if (file.size > maxSize) {
          throw new UploadThingError(
            `File too large. Maximum ${maxSize / 1024 / 1024}MB for ${
              profile?.subscription_tier
            } tier`
          );
        }
      });

      // Return metadata to be available in onUploadComplete
      return {
        userId: user.id,
        tier: profile?.subscription_tier || "free",
        draftId: req.headers.get("x-draft-id") || null,
        sessionId: req.headers.get("x-session-id") || null,
      };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      // File is now uploaded to UploadThing
      // Insert record into chat_attachments with UploadThing URL

      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const attachmentData = {
        user_id: metadata.userId,
        draft_id: metadata.draftId,
        session_id: metadata.sessionId,
        storage_path: file.url, // Store UploadThing URL instead of Supabase path
        mime_type: file.type,
        size_bytes: file.size,
        original_name: file.name,
        status: "ready",
        // New column needed: storage_provider = 'uploadthing'
        storage_provider: "uploadthing",
        uploadthing_key: file.key, // Store key for deletion
      };

      const { data: attachment, error } = await supabase
        .from("chat_attachments")
        .insert(attachmentData)
        .select()
        .single();

      if (error) {
        console.error("Failed to save attachment metadata:", error);
        // Consider deleting from UploadThing if DB insert fails
        throw new UploadThingError("Failed to save attachment");
      }

      return {
        attachmentId: attachment.id,
        url: file.url,
        key: file.key,
      };
    }),
} satisfies FileRouter;

export type AppFileRouter = typeof fileRouter;
```

#### 2.2 Expose UploadThing Route with Authentication

```typescript
import { createNextRouteHandler } from "uploadthing/next";
import { fileRouter } from "./core";
import { withProtectedAuth } from "@/lib/middleware/auth";
import { withTieredRateLimit } from "@/lib/middleware/redisRateLimitMiddleware";

const handlers = createNextRouteHandler({
  router: fileRouter,
  config: {
    // UploadThing will forward these headers to our middleware
    callbackHeaders: ["x-draft-id", "x-session-id"],
  },
});

// Wrap with our standard middleware
export const GET = withProtectedAuth(
  withTieredRateLimit(handlers.GET, { tier: "tierB" })
);

export const POST = withProtectedAuth(
  withTieredRateLimit(handlers.POST, { tier: "tierB" })
);
```

### Phase 3: Database Schema Updates

#### 3.1 Add New Columns to chat_attachments

```sql
ALTER TABLE chat_attachments
ADD COLUMN IF NOT EXISTS storage_provider TEXT DEFAULT 'supabase'
  CHECK (storage_provider IN ('supabase', 'uploadthing')),
ADD COLUMN IF NOT EXISTS uploadthing_key TEXT,
ADD COLUMN IF NOT EXISTS uploadthing_url TEXT;

-- Update storage_path to be nullable for future (UploadThing uses uploadthing_url)
ALTER TABLE chat_attachments
ALTER COLUMN storage_path DROP NOT NULL;

-- Add index for provider queries
CREATE INDEX IF NOT EXISTS idx_chat_attachments_provider
ON chat_attachments(storage_provider);
```

### Phase 4: Frontend Component Updates

#### 4.1 Replace Upload Logic in ChatInput

```typescript
import { useUploadThing } from "@/lib/uploadthing";

export function ChatInput() {
  const [draftId] = useState(() => crypto.randomUUID());
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const { startUpload, isUploading } = useUploadThing("chatImage", {
    headers: {
      "x-draft-id": draftId,
      "x-session-id": sessionId || "",
    },
    onClientUploadComplete: (res) => {
      // res[0] contains { attachmentId, url, key } from our onUploadComplete
      const uploaded = res[0];
      setAttachments((prev) => [
        ...prev,
        {
          id: uploaded.attachmentId,
          url: uploaded.url,
          key: uploaded.key,
          // ... other fields
        },
      ]);
    },
    onUploadError: (error) => {
      toast.error(error.message);
    },
  });

  const handleFileSelect = async (files: File[]) => {
    // Check 3-image limit
    if (attachments.length + files.length > 3) {
      toast.error(
        `Maximum 3 images. You can add ${3 - attachments.length} more.`
      );
      return;
    }

    // Upload via UploadThing
    await startUpload(files);
  };

  // ... rest of component
}
```

### Phase 5: URL Generation Changes

#### 5.1 Modify Message Send Flow

```typescript
async function prepareAttachmentsForLLM(attachmentIds: string[]) {
  // Fetch attachments from DB
  const { data: attachments } = await supabase
    .from("chat_attachments")
    .select("*")
    .in("id", attachmentIds);

  return attachments.map((attachment) => {
    if (attachment.storage_provider === "uploadthing") {
      // UploadThing URLs are already public/accessible
      // No signed URL generation needed
      return {
        type: "image_url",
        image_url: {
          url: attachment.uploadthing_url || attachment.storage_path,
        },
      };
    } else {
      // Legacy Supabase storage - generate signed URL
      const { data } = await supabase.storage
        .from("attachments-images")
        .createSignedUrl(attachment.storage_path, 300);

      return {
        type: "image_url",
        image_url: { url: data.signedUrl },
      };
    }
  });
}
```

#### 5.2 History Loading - No Signed URL Needed

```typescript
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  // ... auth validation ...

  const { data: attachment } = await supabase
    .from("chat_attachments")
    .select("*")
    .eq("id", params.id)
    .single();

  if (attachment.storage_provider === "uploadthing") {
    // Return the permanent URL directly
    return NextResponse.json({
      id: attachment.id,
      signedUrl: attachment.uploadthing_url || attachment.storage_path,
      ttlSeconds: null, // No expiry for UploadThing URLs
    });
  } else {
    // Legacy Supabase - generate signed URL
    const { data } = await supabase.storage
      .from("attachments-images")
      .createSignedUrl(attachment.storage_path, 300);

    return NextResponse.json({
      id: attachment.id,
      signedUrl: data.signedUrl,
      ttlSeconds: 300,
    });
  }
}
```

### Phase 6: Deletion Updates

#### 6.1 Handle UploadThing Deletion

```typescript
import { UTApi } from "uploadthing/server";

const utapi = new UTApi();

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  // ... auth and ownership validation ...

  const { data: attachment } = await supabase
    .from("chat_attachments")
    .select("*")
    .eq("id", params.id)
    .single();

  if (attachment.storage_provider === "uploadthing") {
    // Delete from UploadThing
    await utapi.deleteFiles(attachment.uploadthing_key);
  } else {
    // Delete from Supabase Storage
    await supabase.storage
      .from("attachments-images")
      .remove([attachment.storage_path]);
  }

  // Soft delete in DB
  await supabase
    .from("chat_attachments")
    .update({ status: "deleted", deleted_at: new Date().toISOString() })
    .eq("id", params.id);

  return new Response(null, { status: 204 });
}
```

### Phase 7: Admin Dashboard Updates

#### 7.1 Cleanup Jobs for Both Providers

```typescript
async function cleanupOrphans() {
  // Find orphaned attachments
  const { data: orphans } = await supabase
    .from("chat_attachments")
    .select("*")
    .is("message_id", null)
    .lt("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .eq("status", "ready");

  for (const orphan of orphans) {
    if (orphan.storage_provider === "uploadthing") {
      await utapi.deleteFiles(orphan.uploadthing_key);
    } else {
      await supabase.storage
        .from("attachments-images")
        .remove([orphan.storage_path]);
    }

    // Update DB
    await supabase
      .from("chat_attachments")
      .update({ status: "deleted", deleted_at: new Date().toISOString() })
      .eq("id", orphan.id);
  }
}
```

## Migration Strategy

### Option 1: Big Bang Migration

- Set a maintenance window
- Migrate all existing attachments to UploadThing
- Switch over completely
- **Pros**: Clean, single system
- **Cons**: Risky, requires downtime, data migration complexity

### Option 2: Dual Support (Recommended)

- Keep existing Supabase attachments as-is
- New uploads go to UploadThing
- Support both providers in parallel
- **Pros**: Zero downtime, gradual migration, rollback possible
- **Cons**: Complexity of supporting two systems

### Option 3: Feature Flag Rollout

- Add feature flag for UploadThing
- Test with subset of users
- Gradually increase rollout
- **Pros**: Safe, testable, measurable
- **Cons**: Requires feature flag infrastructure

## Critical Considerations

### 1. URL Privacy

**Issue**: UploadThing free tier serves public URLs (no auth required)
**Current System**: Private signed URLs with 5-min expiry
**Solutions**:

- Upgrade to UploadThing paid tier for private files
- Accept public URLs as trade-off for cost savings
- Implement URL obfuscation (weak security)

### 2. Cost Implications

**Current**:

- Supabase Free: 1GB storage, 5GB egress
- Supabase Pro ($25): 100GB storage, 250GB egress

**With UploadThing**:

- Free: 2GB storage, unlimited downloads
- $10/month: 100GB storage, unlimited downloads
- Keep Supabase Free for DB only

**Savings**: $15/month if storage is the only pressure point

### 3. LLM Access Patterns

**Current**: LLM fetches signed URL once (5-min window)
**UploadThing**: Permanent URL, LLM can fetch anytime
**Impact**: Better for long-running LLM processes, no timeout issues

### 4. Performance

**Current**:

- Upload through your server → Supabase
- Subject to your server's memory/bandwidth

**UploadThing**:

- Direct client → CDN upload
- Reduces server load
- Faster for users with good connections

### 5. Compliance & Data Residency

**Current**: Data stays in Supabase region
**UploadThing**: Check their data residency options
**Action**: Verify compliance requirements before migration

## Recommended Migration Path

### Phase 1: Dual Support Implementation (Week 1-2)

1. Add database columns for provider support
2. Implement UploadThing router with auth
3. Update frontend to use UploadThing for new uploads
4. Keep all read/delete operations working for both

### Phase 2: Testing & Validation (Week 3)

1. Test with internal users
2. Monitor performance and costs
3. Validate LLM access patterns
4. Ensure cleanup jobs work for both providers

### Phase 3: Gradual Rollout (Week 4-5)

1. Enable for 10% of users
2. Monitor metrics (success rate, performance, costs)
3. Increase to 50%, then 100%
4. Keep Supabase code as fallback

### Phase 4: Migration Decision (Week 6)

1. Analyze cost savings
2. Review user feedback
3. Decide whether to:
   - Keep dual support permanently
   - Migrate old attachments to UploadThing
   - Revert to Supabase only

## Implementation Checklist

- [ ] Add UploadThing environment variables
- [ ] Create database migration for new columns
- [ ] Implement UploadThing router with auth middleware
- [ ] Update ChatInput component for UploadThing
- [ ] Modify message send flow for dual URL handling
- [ ] Update attachment deletion for both providers
- [ ] Adapt admin cleanup jobs
- [ ] Add monitoring for both storage providers
- [ ] Create feature flag for gradual rollout
- [ ] Document new upload flow
- [ ] Test LLM access with UploadThing URLs
- [ ] Verify rate limiting works with new endpoints
- [ ] Update cost calculation for dual providers
- [ ] Plan data migration strategy for existing attachments

## Risk Assessment

| Risk                                | Impact | Mitigation                               |
| ----------------------------------- | ------ | ---------------------------------------- |
| Public URLs expose sensitive images | High   | Use paid tier or accept risk             |
| UploadThing service outage          | Medium | Keep Supabase as fallback                |
| Migration corrupts data             | High   | Backup before migration, test thoroughly |
| Cost increases unexpectedly         | Low    | Monitor usage, set alerts                |
| LLMs can't access UploadThing URLs  | High   | Test with all models first               |

## Conclusion

Migration to UploadThing is **feasible** with the dual-support approach. The main benefits are:

- Cost savings ($15/month for 100GB)
- No egress charges
- Better upload performance (direct to CDN)
- Reduced server load

The main trade-offs are:

- Public URLs (unless paid tier)
- Additional complexity during transition
- Dependency on external service

**Recommendation**: Implement dual support first, test thoroughly, then make a data-driven decision on full migration based on actual usage patterns and cost savings.
