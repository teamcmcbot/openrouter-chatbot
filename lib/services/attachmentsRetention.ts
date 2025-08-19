// lib/services/attachmentsRetention.ts
// Tier-based retention cleanup for image attachments.
// Deletes storage objects and soft-deletes DB rows for attachments older than
// a per-tier cutoff: Free=30d, Pro=60d, Enterprise=90d (defaults, configurable via params).

import { createServiceClient } from "../supabase/service";
import { logger } from "../utils/logger";

export type RetentionRunParams = {
  // Defaults: free 30, pro 60, enterprise 90
  daysByTier?: Partial<Record<"free" | "pro" | "enterprise", number>>;
  limit?: number; // max rows to process per run across all tiers
  dryRun?: boolean;
};

export type RetentionResult = {
  scanned: number;
  deletedStorage: number;
  softDeletedRows: number;
  byTier: Record<string, { scanned: number; deletedStorage: number; softDeletedRows: number }>;
  sampleIds: string[];
  errors: Array<{ id: string; error: string }>;
};

type AttachmentRow = {
  id: string;
  user_id: string;
  storage_bucket: string;
  storage_path: string;
  created_at: string;
  status: string;
  // joined
  profiles?: { subscription_tier?: "free" | "pro" | "enterprise" | null } | null;
};

const DEFAULT_DAYS: Record<"free" | "pro" | "enterprise", number> = {
  free: 30,
  pro: 60,
  enterprise: 90,
};

export async function cleanupRetentionByTier(params: RetentionRunParams = {}): Promise<RetentionResult> {
  const supabase = createServiceClient();
  const limit = Math.max(1, Math.min(params.limit ?? 1000, 5000));
  const daysMap: Record<"free" | "pro" | "enterprise", number> = {
    ...DEFAULT_DAYS,
    ...(params.daysByTier || {}),
  } as Record<"free" | "pro" | "enterprise", number>;

  // Compute cutoffs
  const cutoffISO: Record<"free" | "pro" | "enterprise", string> = {
    free: new Date(Date.now() - daysMap.free * 24 * 60 * 60 * 1000).toISOString(),
    pro: new Date(Date.now() - daysMap.pro * 24 * 60 * 60 * 1000).toISOString(),
    enterprise: new Date(Date.now() - daysMap.enterprise * 24 * 60 * 60 * 1000).toISOString(),
  };

  // Fetch up to `limit` candidates across all tiers, oldest first.
  // We attempt a join to profiles to read subscription_tier per attachment.
  // If the FK is present, Supabase will allow `profiles(subscription_tier)` selection.
  const { data, error } = await supabase
    .from("chat_attachments")
    .select(
      "id, user_id, storage_bucket, storage_path, created_at, status, profiles(subscription_tier)",
      { count: "exact", head: false }
    )
    .eq("status", "ready")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    logger.error("Retention: failed to list attachments", error);
    throw new Error(error.message);
  }

  const rows = (data as AttachmentRow[] | null) || [];
  const candidates: AttachmentRow[] = [];
  const byTierScanned: Record<string, number> = {};

  for (const row of rows) {
    const tier = (row.profiles?.subscription_tier || "free") as "free" | "pro" | "enterprise";
    const tierCutoff = cutoffISO[tier];
    if (row.created_at < tierCutoff) {
      candidates.push(row);
      byTierScanned[tier] = (byTierScanned[tier] || 0) + 1;
    }
  }

  const result: RetentionResult = {
    scanned: candidates.length,
    deletedStorage: 0,
    softDeletedRows: 0,
    byTier: Object.fromEntries(Object.entries(byTierScanned).map(([k, v]) => [k, { scanned: v, deletedStorage: 0, softDeletedRows: 0 }])),
    sampleIds: candidates.slice(0, 10).map((r) => r.id),
    errors: [],
  };

  if (params.dryRun || candidates.length === 0) return result;

  // Group paths by bucket
  const byBucket: Record<string, string[]> = {};
  for (const r of candidates) {
    if (!r.storage_path) continue;
    byBucket[r.storage_bucket] ||= [];
    byBucket[r.storage_bucket].push(r.storage_path);
  }

  // Delete storage objects per bucket (best-effort)
  for (const [bucket, paths] of Object.entries(byBucket)) {
    try {
      const { error: delErr } = await supabase.storage.from(bucket).remove(paths);
      if (delErr) throw delErr;
      result.deletedStorage += paths.length;
    } catch (e: unknown) {
      const errMsg = typeof e === "object" && e !== null && "message" in e ? String((e as { message?: string }).message) : String(e);
      logger.warn("Retention: storage deletion error (continuing)", { bucket, error: errMsg });
      // proceed to soft-delete DB rows regardless
    }
  }

  // Soft-delete DB rows for candidates
  const ids = candidates.map((r) => r.id);
  const { error: updateErr } = await supabase
    .from("chat_attachments")
    .update({ status: "deleted", deleted_at: new Date().toISOString() })
    .in("id", ids);

  if (updateErr) {
    logger.error("Retention: soft-delete DB update failed", updateErr);
    result.errors.push({ id: "batch", error: updateErr.message });
  } else {
    result.softDeletedRows = ids.length;
  }

  return result;
}
