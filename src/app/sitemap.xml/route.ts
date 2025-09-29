const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");

const routes = [
  {
    path: "/",
    changefreq: "weekly" as const,
    priority: "1.0",
  },
  {
    path: "/chat",
    changefreq: "weekly" as const,
    priority: "0.7",
  },
  {
    path: "/models",
    changefreq: "daily" as const,
    priority: "0.9",
  },
];

const buildXml = () => {
  const lastmod = new Date().toISOString().split("T")[0];
  const urls = routes
    .map(({ path, changefreq, priority }) => {
      return [
        "  <url>",
        `    <loc>${baseUrl}${path}</loc>`,
        `    <lastmod>${lastmod}</lastmod>`,
        `    <changefreq>${changefreq}</changefreq>`,
        `    <priority>${priority}</priority>`,
        "  </url>",
      ].join("\n");
    })
    .join("\n");

  return [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    "</urlset>",
    "",
  ].join("\n");
};

export const revalidate = 3600; // 1 hour

export async function GET() {
  const body = buildXml();

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600",
    },
  });
}
