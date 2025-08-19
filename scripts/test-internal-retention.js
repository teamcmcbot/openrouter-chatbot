#!/usr/bin/env node
/* Test the internal attachments retention endpoint locally using Bearer token or HMAC */

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const TOKEN = process.env.INTERNAL_CLEANUP_TOKEN || "dev_cleanup_token";
const SECRET = process.env.INTERNAL_CLEANUP_SECRET || "dev_cleanup_secret";
const USE_HMAC =
  process.env.USE_HMAC === "1" || process.argv.includes("--hmac");

(async () => {
  try {
    const fetchFn = globalThis.fetch;
    if (typeof fetchFn !== "function") {
      throw new Error(
        "Global fetch is not available. Use Node.js >= 18 or install and use undici."
      );
    }

    // Parse optional tier day overrides from env vars
    const daysByTier = {};
    if (process.env.FREE_DAYS) daysByTier.free = Number(process.env.FREE_DAYS);
    if (process.env.PRO_DAYS) daysByTier.pro = Number(process.env.PRO_DAYS);
    if (process.env.ENTERPRISE_DAYS)
      daysByTier.enterprise = Number(process.env.ENTERPRISE_DAYS);

    const bodyObj = {
      daysByTier: Object.keys(daysByTier).length ? daysByTier : undefined,
      limit: Number(process.env.LIMIT || 1000),
      dryRun: process.env.DRY_RUN === "1" || process.argv.includes("--dry"),
      source: USE_HMAC ? "local-retention-hmac" : "local-retention-bearer",
    };
    const body = JSON.stringify(bodyObj);

    const headers = { "Content-Type": "application/json" };

    if (USE_HMAC) {
      const { createHmac } = await import("crypto");
      const signature = createHmac("sha256", SECRET).update(body).digest("hex");
      headers["X-Signature"] = signature;
      console.log("HMAC mode: X-Signature=", signature);
    } else {
      headers["Authorization"] = `Bearer ${TOKEN}`;
      console.log("Bearer mode: Authorization set");
    }

    const res = await fetchFn(
      `${BASE_URL}/api/internal/attachments/retention`,
      {
        method: "POST",
        headers,
        body,
      }
    );

    const text = await res.text();
    console.log("Status:", res.status);
    console.log("Headers:", {
      "X-Response-Time": res.headers.get("x-response-time"),
    });
    console.log("Body:", text);
  } catch (e) {
    console.error("Test error:", e);
    process.exit(1);
  }
})();
