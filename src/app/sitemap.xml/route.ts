import { getModelCatalog } from "../../../lib/server/modelCatalog";

const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");

const staticRoutes = [
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

// Popular filter combinations to include in sitemap for SEO
const popularFilterRoutes = [
  {
    path: "/models?features=free",
    changefreq: "weekly" as const,
    priority: "0.7",
  },
  {
    path: "/models?features=multimodal",
    changefreq: "weekly" as const,
    priority: "0.7",
  },
  {
    path: "/models?features=reasoning",
    changefreq: "weekly" as const,
    priority: "0.7",
  },
  {
    path: "/models?features=image",
    changefreq: "weekly" as const,
    priority: "0.7",
  },
  {
    path: "/models?providers=openai",
    changefreq: "weekly" as const,
    priority: "0.7",
  },
  {
    path: "/models?providers=google",
    changefreq: "weekly" as const,
    priority: "0.7",
  },
  {
    path: "/models?providers=anthropic",
    changefreq: "weekly" as const,
    priority: "0.7",
  },
  {
    path: "/models?features=free&providers=google",
    changefreq: "weekly" as const,
    priority: "0.6",
  },
  {
    path: "/models?features=paid",
    changefreq: "weekly" as const,
    priority: "0.6",
  },
];

const buildXml = async () => {
  // Fetch model catalog to generate model detail page URLs
  const catalog = await getModelCatalog();
  
  // Generate model detail URLs with proper encoding
  const modelRoutes = catalog.models.map((model) => ({
    path: `/models/${encodeURIComponent(model.id)}`,
    changefreq: "weekly" as const,
    priority: "0.8",
  }));

  // Combine all routes
  const allRoutes = [...staticRoutes, ...modelRoutes, ...popularFilterRoutes];

  const urls = allRoutes
    .map(({ path, changefreq, priority }) => {
      // XML-escape ampersands in URLs for valid XML
      const escapedPath = path.replace(/&/g, '&amp;');
      return [
        "  <url>",
        `    <loc>${baseUrl}${escapedPath}</loc>`,
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
  const body = await buildXml();

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600",
    },
  });
}
