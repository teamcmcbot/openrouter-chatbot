// lib/services/attachmentsStorage.ts
// Storage-level stats and purge utilities for attachments bucket

import { createServiceClient } from '../supabase/service';
import { logger } from '../utils/logger';

const DEFAULT_BUCKET = 'attachments-images';
// Back-compat alias used by list/purge utilities below
const BUCKET = DEFAULT_BUCKET;

export type StorageStats = {
  storageLiveObjects: number;
  storageTotalBytes: number;
  storageOrphans: {
    count: number;
    totalBytes: number;
  };
};

export type StorageOrphansList = {
  objects: Array<{ path: string; bytes: number; created_at: string }>; // storage-only orphans
  total: number; // same as objects.length for the page
};

// Minimal row shapes to avoid any
type StorageObjectRow = {
  name: string;
  created_at: string;
  // Some projects may not expose a concrete `size` column on storage.objects.
  // Keep optional for forward/back compat and prefer metadata-derived size.
  size?: number | null;
  metadata?: Record<string, unknown> | null; // optional fallback
};

type AttachmentLinkRow = {
  storage_path: string;
};

// Helper: parse bytes from storage.objects.metadata JSON
function parseBytesFromRow(row: StorageObjectRow): number {
  // Prefer storage.objects.size when available; fall back to metadata size if present
  const fromSize = typeof row.size === 'number' && Number.isFinite(row.size) ? row.size : null;
  if (fromSize !== null) return fromSize;
  try {
    const meta = row.metadata;
    if (!meta || typeof meta !== 'object') return 0;
    const obj = meta as Record<string, unknown>;
    const size = (obj['size'] as number | string | undefined) ?? (obj['Content-Length'] as number | string | undefined);
    const n = Number(size);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

// Discover candidate storage bucket ids used by attachments/images in this environment
async function getCandidateBucketIds(): Promise<string[]> {
  const sb = createServiceClient();
  // 1) Prefer what the DB rows actually reference
  const fromDb = await sb
    .from('chat_attachments')
    .select('storage_bucket')
    .limit(50);

  const ids = new Set<string>();
  (fromDb.data as Array<{ storage_bucket: string | null }> | null | undefined)?.forEach((r) => {
    if (r.storage_bucket) ids.add(r.storage_bucket);
  });
  if (ids.size > 0) return Array.from(ids);

  // 2) Otherwise, probe storage.buckets and pick plausible ones
  const { data: buckets } = await sb
    .schema('storage')
    .from('buckets')
    .select('id');

  const all = (buckets as Array<{ id: string }> | null | undefined)?.map((b) => b.id) ?? [];
  // Always include DEFAULT_BUCKET as a last-resort candidate to avoid returning no buckets
  if (!all.includes(DEFAULT_BUCKET)) all.push(DEFAULT_BUCKET);
  if (all.length === 0) return [DEFAULT_BUCKET];

  const plausible = all.filter((id) => /attach/i.test(id) || id === DEFAULT_BUCKET);
  return plausible.length > 0 ? plausible : all;
}

/**
 * Compute storage stats and storage-only orphan counts by scanning storage.objects
 * Notes:
 * - Uses service role; do not expose directly to non-admin callers.
 * - For large buckets, consider pagination parameters; here we scan up to `scanLimit`.
 */
export async function getStorageStats(scanLimit: number = 5000): Promise<StorageStats> {
  const sb = createServiceClient();
  const bucketIds = await getCandidateBucketIds();

  if (bucketIds.length === 0) {
    // No buckets visible — return zeros but log once to aid debugging
    logger.warn('Storage stats: no candidate buckets found; returning zeros');
    return { storageLiveObjects: 0, storageTotalBytes: 0, storageOrphans: { count: 0, totalBytes: 0 } };
  }

  // Count live objects across candidate buckets
  const liveCountHead = await sb
    .schema('storage')
    .from('objects')
    .select('id', { count: 'exact', head: true })
    .in('bucket_id', bucketIds);

  if (liveCountHead.error) {
    logger.warn('Storage stats: live count query failed', { error: liveCountHead.error.message });
  }
  const storageLiveObjects = liveCountHead.count ?? 0;

  // Fetch a page of objects to compute total bytes (approx if > scanLimit)
  const liveObjs = await sb
    .schema('storage')
    .from('objects')
  // Some deployments don't include a physical `size` column; request metadata only and compute bytes from it.
  .select('name, created_at, metadata')
    .in('bucket_id', bucketIds)
    .order('created_at', { ascending: true })
    .limit(scanLimit);

  if (liveObjs.error) {
    logger.warn('Storage stats: list objects query failed', { error: liveObjs.error.message });
  }
  const objects: StorageObjectRow[] = (liveObjs.data as StorageObjectRow[]) ?? [];
  const storageTotalBytes = objects.reduce((acc: number, o: StorageObjectRow) => acc + parseBytesFromRow(o), 0);

  // Compute storage-only orphans: LEFT join style in memory
  const names = objects.map((o) => o.name);
  let orphanCount = 0;
  let orphanBytes = 0;

  if (names.length > 0) {
    const { data: links, error: linksErr } = await sb
      .from('chat_attachments')
      .select('storage_path')
      .in('storage_path', names);
    if (linksErr) {
      logger.warn('Storage stats: join to chat_attachments failed', { error: linksErr.message });
    }
    const linked = new Set<string>(((links as AttachmentLinkRow[]) ?? []).map((r) => r.storage_path));
    for (const o of objects) {
      if (!linked.has(o.name)) {
        orphanCount += 1;
        orphanBytes += parseBytesFromRow(o);
      }
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    logger.info('Storage stats buckets used', { bucketIds, objectsScanned: objects.length });
  }

  return {
    storageLiveObjects,
    storageTotalBytes,
    storageOrphans: { count: orphanCount, totalBytes: orphanBytes },
  };
}

/**
 * List a batch of storage-only orphans older than a cutoff, up to limit.
 */
export async function listStorageOnlyOrphans(
  olderThanHours: number = 24,
  limit: number = 500
): Promise<StorageOrphansList> {
  const sb = createServiceClient();
  const cutoffIso = new Date(Date.now() - olderThanHours * 3600 * 1000).toISOString();

  // Fetch candidate objects (older than cutoff)
  const { data: objs } = await sb
    .schema('storage')
    .from('objects')
  .select('name, created_at, metadata')
    .eq('bucket_id', BUCKET)
  // Avoid assuming presence of deleted_at column; list API will only return live objects.
    .lt('created_at', cutoffIso)
    .order('created_at', { ascending: true })
    .limit(limit);

  const objects: StorageObjectRow[] = (objs as StorageObjectRow[]) ?? [];
  if (objects.length === 0) return { objects: [], total: 0 };

  const names = objects.map((o) => o.name);
  const { data: links } = await sb
    .from('chat_attachments')
    .select('storage_path')
    .in('storage_path', names);

  const linked = new Set<string>(((links as AttachmentLinkRow[]) ?? []).map((r) => r.storage_path));
  const orphans = objects
    .filter((o) => !linked.has(o.name))
    .map((o) => ({ path: o.name, bytes: parseBytesFromRow(o), created_at: o.created_at }));

  return { objects: orphans, total: orphans.length };
}

/**
 * Purge storage-only orphans. If dryRun, no deletion is performed.
 */
export async function purgeStorageOnlyOrphans(opts: {
  olderThanHours?: number;
  limit?: number;
  dryRun?: boolean;
}): Promise<{
  success: boolean;
  toDelete: string[];
  deleted: number;
  bytesFreed: number;
}> {
  const { olderThanHours = 24, limit = 500, dryRun = true } = opts;
  const sb = createServiceClient();

  const list = await listStorageOnlyOrphans(olderThanHours, limit);
  const toDelete = list.objects.map((o) => o.path);
  const bytesFreed = list.objects.reduce((acc, o) => acc + (o.bytes || 0), 0);

  if (dryRun || toDelete.length === 0) {
    return { success: true, toDelete, deleted: 0, bytesFreed };
  }

  const { error } = await sb.storage.from(BUCKET).remove(toDelete);
  if (error) {
    // Partial deletes not tracked here; surface as zero and require rerun
    return { success: false, toDelete, deleted: 0, bytesFreed: 0 };
  }
  return { success: true, toDelete, deleted: toDelete.length, bytesFreed };
}
