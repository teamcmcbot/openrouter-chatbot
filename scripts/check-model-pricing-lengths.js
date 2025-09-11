#!/usr/bin/env node
// Plain JS version for quick execution without TypeScript.
const API_URL =
  process.env.OPENROUTER_MODELS_API_URL ||
  "https://openrouter.ai/api/v1/models";
const API_KEY = process.env.OPENROUTER_API_KEY; // optional
const MAX_LEN = 20;

function truncate(v, n = 60) {
  return v.length <= n ? v : v.slice(0, n - 3) + "...";
}

(async () => {
  try {
    const headers = {
      "HTTP-Referer":
        process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
      "X-Title": "OpenRouter Chatbot - Pricing Length Audit",
      "User-Agent": "OpenRouter-Chatbot/1.0",
    };
    if (API_KEY) headers.Authorization = `Bearer ${API_KEY}`;

    const resp = await fetch(API_URL, { headers });
    if (!resp.ok) {
      const text = await resp.text();
      console.error(
        `Failed to fetch models: ${resp.status} ${resp.statusText}`
      );
      console.error(text.slice(0, 500));
      process.exit(1);
    }
    const json = await resp.json();
    const data = json.data || [];

    const offending = [];
    for (const m of data) {
      if (!m.pricing) continue;
      for (const key of Object.keys(m.pricing)) {
        const raw = m.pricing[key];
        if (typeof raw === "string" && raw.length > MAX_LEN)
          offending.push({
            modelId: m.id,
            field: key,
            length: raw.length,
            value: raw,
          });
      }
    }

    if (offending.length === 0) {
      console.log(
        `No pricing fields exceed ${MAX_LEN} characters across ${data.length} models.`
      );
      process.exit(0);
    }

    console.log(
      `Found ${offending.length} pricing entries exceeding ${MAX_LEN} characters:`
    );
    const byField = {};
    for (const o of offending) byField[o.field] = (byField[o.field] || 0) + 1;

    console.log("\nSummary by field:");
    Object.entries(byField).forEach(([f, c]) => console.log(`  - ${f}: ${c}`));

    console.log("\nDetails (sorted by length desc):");
    offending
      .sort((a, b) => b.length - a.length)
      .forEach((o) =>
        console.log(
          `model=${o.modelId} field=${o.field} length=${
            o.length
          } value='${truncate(o.value)}'`
        )
      );

    const maxLen = offending[0].length;
    console.log(`\nMax observed length: ${maxLen}`);
    console.log(
      "Recommendation: Set pricing columns to at least this length or normalize values."
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    process.exit(1);
  }
})();
