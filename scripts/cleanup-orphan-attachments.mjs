#!/usr/bin/env node
/*
  Orphan Attachments Storage Cleanup
  - Deletes Storage objects from the 'attachments-images' bucket that are not linked
    to a session/message and are older than a cutoff.
  - Then soft-deletes corresponding rows in public.chat_attachments.

  Requirements:
  - SUPABASE_URL
  - SUPABASE_SERVICE_ROLE_KEY (service key; keep secure)

  Usage:
    node scripts/cleanup-orphan-attachments.mjs --hours 24 --dry-run
    node scripts/cleanup-orphan-attachments.mjs --hours 24

  Options:
    --hours <n>     Age cutoff in hours (default 24)
    --limit <n>     Max rows per batch (default 1000)
    --dry-run       Do not delete, only print planned actions

  NOTE: This script runs with service role permissions; DO NOT expose the key.
*/

import process from "node:process";
import { createClient } from "@supabase/supabase-js";

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { hours: 24, limit: 1000, dryRun: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--hours") opts.hours = parseInt(args[++i] || "24", 10);
    else if (a === "--limit") opts.limit = parseInt(args[++i] || "1000", 10);
    else if (a === "--dry-run") opts.dryRun = true;
  }
  return opts;
}

function env(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

async function main() {
  const { hours, limit, dryRun } = parseArgs();
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

  const supabase = createClient(
    env("SUPABASE_URL"),
    env("SUPABASE_SERVICE_ROLE_KEY")
  );

  // 1) Fetch orphan attachments
  const { data: rows, error } = await supabase
    .from("chat_attachments")
    .select("id, storage_path")
    .is("session_id", null)
    .is("message_id", null)
    .eq("status", "ready")
    .not("storage_path", "is", null)
    .gt("created_at", "1900-01-01") // ensure created_at exists
    .lt("created_at", cutoff.toISOString())
    .limit(limit);

  if (error) throw error;
  const targets = (rows || []).filter((r) => (r.storage_path || "").length > 0);
  console.log(
    `Found ${targets.length} orphan attachments older than ${hours}h`
  );

  if (targets.length === 0) return;

  const bucket = "attachments-images";
  const paths = targets.map((t) => t.storage_path);

  // 2) Delete files from Storage (skip in dry-run)
  if (dryRun) {
    console.log(
      `[DRY-RUN] Would delete ${paths.length} objects from bucket ${bucket}`
    );
  } else {
    const { data: delRes, error: delErr } = await supabase.storage
      .from(bucket)
      .remove(paths);
    if (delErr) throw delErr;
    console.log(`Storage removed ${delRes?.length ?? 0} objects`);
  }

  // 3) Soft-delete DB rows (skip in dry-run)
  if (dryRun) {
    console.log(
      `[DRY-RUN] Would soft-delete ${targets.length} chat_attachments rows`
    );
  } else {
    const { error: updErr } = await supabase
      .from("chat_attachments")
      .update({ status: "deleted", deleted_at: new Date().toISOString() })
      .in(
        "id",
        targets.map((t) => t.id)
      );
    if (updErr) throw updErr;
    console.log(`Soft-deleted ${targets.length} chat_attachments rows`);
  }
}

main().catch((err) => {
  console.error("Cleanup failed:", err.message || err);
  process.exit(1);
});
