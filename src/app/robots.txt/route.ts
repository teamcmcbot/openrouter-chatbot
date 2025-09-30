const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");

export async function GET() {
  const robotsTxt = `# Robots.txt for ${baseUrl}
# Generated dynamically by Next.js

# Allow all crawlers by default
User-agent: *

# Public routes - allow all
Allow: /
Allow: /chat
Allow: /models
Allow: /models/*
Allow: /auth/signin
Allow: /usage/costs
Allow: /account/subscription

# Block admin routes
Disallow: /admin
Disallow: /admin/*

# Block all API routes except health checks
Disallow: /api/
Allow: /api/health/*

# Block internal/admin API endpoints explicitly
Disallow: /api/admin/*
Disallow: /api/internal/*
Disallow: /api/cron/*

# Block auth callbacks and error pages
Disallow: /auth/callback
Disallow: /auth/error

# Block test/debug pages
Disallow: /test-env
Disallow: /api/debug/*

# Sitemap location
Sitemap: ${baseUrl}/sitemap.xml

# Crawl delay (optional - remove if not needed)
# Crawl-delay: 1
`;

  return new Response(robotsTxt, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400", // 24 hours
    },
  });
}
