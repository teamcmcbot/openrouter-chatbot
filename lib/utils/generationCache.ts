"use client";

import { GenerationData } from "../types/generation";

// Global, anonymous-friendly cache with TTL and LRU
const CACHE_KEY = "openrouter-generation-cache";
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_ENTRIES = 30; // LRU cap

type CacheEntry = {
  data: GenerationData;
  cachedAt: number; // epoch ms
};

type CacheShape = {
  entries: Record<string, CacheEntry>;
  order: string[]; // MRU at the end
};

function safeRead(): CacheShape {
  if (typeof window === "undefined") {
    return { entries: {}, order: [] };
  }
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return { entries: {}, order: [] };
    const parsed = JSON.parse(raw) as CacheShape;
    if (!parsed || typeof parsed !== "object") return { entries: {}, order: [] };
    // Basic shape validation
    if (!parsed.entries || !parsed.order) return { entries: {}, order: [] };
    return parsed;
  } catch {
    return { entries: {}, order: [] };
  }
}

function safeWrite(cache: CacheShape) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore write errors (quota, etc.)
  }
}

function touchOrder(cache: CacheShape, id: string) {
  const idx = cache.order.indexOf(id);
  if (idx !== -1) cache.order.splice(idx, 1);
  cache.order.push(id);
}

function prune(cache: CacheShape) {
  // Remove expired
  const now = Date.now();
  for (const id of Object.keys(cache.entries)) {
    const entry = cache.entries[id];
    if (!entry || now - entry.cachedAt > TTL_MS) {
      delete cache.entries[id];
      const idx = cache.order.indexOf(id);
      if (idx !== -1) cache.order.splice(idx, 1);
    }
  }
  // Enforce LRU size
  while (cache.order.length > MAX_ENTRIES) {
    const lru = cache.order.shift();
    if (lru) delete cache.entries[lru];
  }
}

export function getGenerationFromCache(id: string): GenerationData | null {
  const cache = safeRead();
  prune(cache);
  const entry = cache.entries[id];
  if (!entry) {
    safeWrite(cache); // persist any pruning
    return null;
  }
  // TTL check (prune already did this, but double-check)
  const now = Date.now();
  if (now - entry.cachedAt > TTL_MS) {
    delete cache.entries[id];
    const idx = cache.order.indexOf(id);
    if (idx !== -1) cache.order.splice(idx, 1);
    safeWrite(cache);
    return null;
  }
  // Touch for MRU
  touchOrder(cache, id);
  safeWrite(cache);
  return entry.data;
}

export function setGenerationInCache(id: string, data: GenerationData): void {
  const cache = safeRead();
  cache.entries[id] = { data, cachedAt: Date.now() };
  touchOrder(cache, id);
  prune(cache);
  safeWrite(cache);
}

export function clearGenerationCache(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}
