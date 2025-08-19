// lib/services/attachmentsStats.ts
// Provides aggregate stats for attachments for admin dashboard

import { createServiceClient } from '../supabase/service';

export type AttachmentsStats = {
  totalAttachments: number;
  uploadedToday: number;
  unlinkedAll: number;
  unlinkedOlder24h: number;
  totalBytesApprox: number; // from chat_attachments.size_bytes sum (approx)
};

function startOfTodayISO(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return start.toISOString();
}

export async function getAttachmentsStats(): Promise<AttachmentsStats> {
  const supabase = createServiceClient();

  const todayIso = startOfTodayISO();
  const cutoffIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // totalAttachments and totalBytesApprox
  const totalAgg = await supabase
    .from('chat_attachments')
    .select('count:id, sum:size_bytes', { count: 'exact', head: false })
    .limit(1);

  const totalAttachments = totalAgg.count ?? 0;
  const totalBytesApprox = Array.isArray(totalAgg.data) && totalAgg.data.length > 0
    ? (totalAgg.data as unknown as Array<{ sum: number | null }>)[0]?.sum ?? 0
    : 0;

  // uploadedToday
  const { count: uploadedTodayRaw } = await supabase
    .from('chat_attachments')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', todayIso);

  // unlinkedAll
  const { count: unlinkedAllRaw } = await supabase
    .from('chat_attachments')
    .select('id', { count: 'exact', head: true })
    .is('session_id', null)
    .is('message_id', null)
    .eq('status', 'ready');

  // unlinkedOlder24h
  const { count: unlinkedOlder24hRaw } = await supabase
    .from('chat_attachments')
    .select('id', { count: 'exact', head: true })
    .is('session_id', null)
    .is('message_id', null)
    .eq('status', 'ready')
    .lt('created_at', cutoffIso);

  return {
    totalAttachments,
    uploadedToday: uploadedTodayRaw ?? 0,
    unlinkedAll: unlinkedAllRaw ?? 0,
    unlinkedOlder24h: unlinkedOlder24hRaw ?? 0,
    totalBytesApprox: Number(totalBytesApprox) || 0,
  };
}
