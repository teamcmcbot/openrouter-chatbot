// lib/services/attachmentsCleanup.ts
// Orphan attachments cleanup utility: finds unlinked image attachments older than a cutoff
// and deletes storage objects + soft-deletes DB rows. Intended for admin-triggered runs.

import { createServiceClient } from '../supabase/service';
import { logger } from '../utils/logger';

export type CleanupResult = {
  scanned: number;
  deletedStorage: number;
  softDeletedRows: number;
  errors: Array<{ id: string; error: string }>;
  sampleIds: string[];
};

export async function cleanupOrphanImageAttachments(hoursOld: number = 24, limit: number = 500): Promise<CleanupResult> {
  const supabase = createServiceClient();
  const cutoffIso = new Date(Date.now() - hoursOld * 60 * 60 * 1000).toISOString();

  // 1) Fetch orphan attachments (unlinked, ready, older than cutoff)
  const { data: rows, error: listErr } = await supabase
    .from('chat_attachments')
    .select('id, storage_bucket, storage_path')
    .is('session_id', null)
    .is('message_id', null)
    .eq('status', 'ready')
    .lt('created_at', cutoffIso)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (listErr) {
    logger.error('Failed to list orphan attachments', listErr);
    throw new Error(listErr.message);
  }

  const items = (rows || []).filter(r => r.storage_path && r.storage_path.length > 0);
  const result: CleanupResult = {
    scanned: items.length,
    deletedStorage: 0,
    softDeletedRows: 0,
    errors: [],
    sampleIds: items.slice(0, 10).map(r => r.id),
  };

  if (items.length === 0) return result;

  // Group by bucket just in case (we expect 'attachments-images')
  const byBucket: Record<string, string[]> = {};
  for (const r of items) {
    byBucket[r.storage_bucket] ||= [];
    byBucket[r.storage_bucket].push(r.storage_path);
  }

  // 2) Best-effort storage delete in batches per bucket
  for (const [bucket, paths] of Object.entries(byBucket)) {
    try {
      const { error: delErr } = await supabase.storage.from(bucket).remove(paths);
      if (delErr) throw delErr;
      result.deletedStorage += paths.length;
    } catch (e: unknown) {
      const errMsg = typeof e === 'object' && e !== null && 'message' in e ? String((e as { message?: string }).message) : String(e);
      logger.warn('Storage deletion error (continuing to soft-delete DB rows)', { bucket, error: errMsg });
      // If a particular object fails, we still proceed with DB soft-delete
    }
  }

  // 3) Soft-delete DB rows for the scanned items
  const ids = items.map(r => r.id);
  const { error: updateErr } = await supabase
    .from('chat_attachments')
    .update({ status: 'deleted', deleted_at: new Date().toISOString() })
    .in('id', ids);

  if (updateErr) {
    logger.error('Soft-delete DB update failed', updateErr);
    // Partial failure; return stats with error info
    result.errors.push({ id: 'batch', error: updateErr.message });
  } else {
    result.softDeletedRows = ids.length;
  }

  return result;
}
