// lib/utils/authSnapshot.ts
import { Redis } from '@upstash/redis';
import { logger } from './logger';

export type AuthSnapshot = {
  v: number; // schema version
  isBanned: boolean;
  bannedUntil: string | null;
  tier: 'free' | 'pro' | 'enterprise';
  accountType: 'user' | 'admin' | null;
  updatedAt: string; // ISO
};

let redis: Redis | null = null;

function getRedis(): Redis | null {
  try {
    if (redis) return redis;
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      redis = Redis.fromEnv();
      return redis;
    }
    return null;
  } catch (e) {
    logger.warn('Auth snapshot: Redis init failed; caching disabled', { err: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

export function snapshotKey(userId: string): string {
  return `auth:snapshot:user:${userId}`;
}

export async function getAuthSnapshot(userId: string): Promise<AuthSnapshot | null> {
  const r = getRedis();
  if (!r) return null;
  try {
    const data = await r.get<unknown>(snapshotKey(userId));
    if (data == null) return null;
    if (typeof data === 'string') {
      return JSON.parse(data) as AuthSnapshot;
    }
    if (typeof data === 'object') {
      // Some SDK versions can auto-serialize JSON; accept object directly
      return data as AuthSnapshot;
    }
    return null;
  } catch (e) {
    logger.warn('Auth snapshot get failed', { err: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

export async function setAuthSnapshot(userId: string, snap: AuthSnapshot, ttlSec?: number): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    const ttl = Number(process.env.AUTH_SNAPSHOT_CACHE_TTL_SECONDS || ttlSec || 900);
    await r.set(snapshotKey(userId), JSON.stringify(snap), { ex: ttl });
  } catch (e) {
    logger.warn('Auth snapshot set failed', { err: e instanceof Error ? e.message : String(e) });
  }
}

export async function deleteAuthSnapshot(userId: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.del(snapshotKey(userId));
  } catch (e) {
    logger.warn('Auth snapshot delete failed', { err: e instanceof Error ? e.message : String(e) });
  }
}
