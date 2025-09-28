import type { MetadataRoute } from "next";

const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");

const routes = ["/", "/chat", "/models", "/usage/costs"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return routes.map((path, index) => {
    const priority = index === 0 ? 1 : path === "/models" ? 0.9 : 0.7;

    return {
      url: `${baseUrl}${path}`,
      lastModified,
      changeFrequency: path === "/models" ? "daily" : "weekly",
      priority,
    } satisfies MetadataRoute.Sitemap[number];
  });
}
