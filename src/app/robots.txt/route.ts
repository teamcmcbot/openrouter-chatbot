const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");

export async function GET() {
  const robotsTxt = `# Robots.txt for ${baseUrl}
# Generated dynamically by Next.js

User-agent: *

# Block sensitive areas
Disallow: /admin
Disallow: /admin/*
Disallow: /api/
Disallow: /auth/
Disallow: /account/
Disallow: /usage/
Disallow: /test-env

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
