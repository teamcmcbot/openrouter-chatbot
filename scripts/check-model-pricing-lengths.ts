#!/usr/bin/env ts-node
/*
 * Script: check-model-pricing-lengths.ts
 * Purpose: Fetch models from OpenRouter and report any pricing fields whose string length exceeds 20 characters.
 * Notes: Endpoint is publicly accessible; API key optional for rate limits or completeness.
 */

interface PricingFields {
  prompt?: string;
  completion?: string;
  request?: string;
  image?: string;
  output_image?: string; // not currently in type but future-proof
  web_search?: string;
  internal_reasoning?: string;
  input_cache_read?: string;
  input_cache_write?: string;
  [k: string]: unknown;
}

interface OpenRouterModelLite {
  id: string;
  name?: string;
  pricing?: PricingFields;
}

const API_URL = process.env.OPENROUTER_MODELS_API_URL || 'https://openrouter.ai/api/v1/models';
const API_KEY = process.env.OPENROUTER_API_KEY; // optional now
const MAX_LEN = 20;

function truncate(v: string, n = 60) {
  return v.length <= n ? v : v.slice(0, n - 3) + '...';
}

(async () => {
  try {
    const headers: Record<string, string> = {
      'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
      'X-Title': 'OpenRouter Chatbot - Pricing Length Audit',
      'User-Agent': 'OpenRouter-Chatbot/1.0'
    };
    if (API_KEY) headers.Authorization = `Bearer ${API_KEY}`;

    const resp = await fetch(API_URL, { headers });
    if (!resp.ok) {
      const text = await resp.text();
      console.error(`Failed to fetch models: ${resp.status} ${resp.statusText}`);
      console.error(text.slice(0, 500));
      process.exit(1);
    }

    const json = await resp.json();
    const data: OpenRouterModelLite[] = json.data || [];

    const offending: Array<{ modelId: string; field: string; length: number; value: string }> = [];
    for (const m of data) {
      if (!m.pricing) continue;
      for (const key of Object.keys(m.pricing)) {
        const raw = (m.pricing as any)[key];
        if (typeof raw === 'string' && raw.length > MAX_LEN) offending.push({ modelId: m.id, field: key, length: raw.length, value: raw });
      }
    }

    if (offending.length === 0) {
      console.log(`No pricing fields exceed ${MAX_LEN} characters across ${data.length} models.`);
      process.exit(0);
    }

    console.log(`Found ${offending.length} pricing entries exceeding ${MAX_LEN} characters:`);
    const byField: Record<string, number> = {};
    for (const o of offending) byField[o.field] = (byField[o.field] || 0) + 1;

    console.log('\nSummary by field:');
    Object.entries(byField).forEach(([f, c]) => console.log(`  - ${f}: ${c}`));

    console.log('\nDetails (sorted by length desc):');
    offending.sort((a, b) => b.length - a.length).forEach(o => console.log(`model=${o.modelId} field=${o.field} length=${o.length} value='${truncate(o.value)}'`));

    const maxLen = offending[0].length;
    console.log(`\nMax observed length: ${maxLen}`);
    console.log('Recommendation: Set pricing columns to at least this length or normalize values.');
  } catch (err) {
    console.error('Unexpected error:', err);
    process.exit(1);
  }
})();
