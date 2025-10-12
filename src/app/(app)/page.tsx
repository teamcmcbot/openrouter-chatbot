import type { Metadata } from "next";
import LandingPageClient from "./LandingPageClient";

const siteUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
const canonicalUrl = siteUrl;
const brandName = process.env.BRAND_NAME || "GreenBubble";

const metaTitle = "GreenBubble Chat | OpenRouter-Powered ChatGPT Alternative";
const metaDescription =
  "GreenBubble is your secure chat workspace powered by OpenRouter. Swap between ChatGPT alternatives, invite your team, and keep conversations logged in Supabase.";

const organizationStructuredData = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: brandName,
  url: canonicalUrl,
  logo: `${siteUrl}/web-app-manifest-512x512.png`,
  description: metaDescription,
};

const productStructuredData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "GreenBubble Chat",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: canonicalUrl,
  description: metaDescription,
  brand: {
    "@type": "Brand",
    name: "OpenRouter",
  },
  offers: {
    "@type": "Offer",
    price: "0.00",
    priceCurrency: "USD",
    availability: "https://schema.org/OnlineOnly",
    url: `${siteUrl}/chat`,
  },
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: metaTitle,
  description: metaDescription,
  keywords: [
    "GreenBubble",
    "OpenRouter chatbot",
    "ChatGPT alternative",
    "multi-model AI chat",
  ],
  alternates: {
    canonical: canonicalUrl,
  },
  openGraph: {
    title: metaTitle,
    description: metaDescription,
    url: canonicalUrl,
    siteName: brandName,
    type: "website",
    images: [
      {
        url: `${siteUrl}/og-image.png`,
        width: 1536,
        height: 804,
        alt: "GreenBubble - Multi-model AI chat with no lock-in. ChatGPT alternative powered by OpenRouter.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: metaTitle,
    description: metaDescription,
    images: [
      {
        url: `${siteUrl}/twitter-card.png`,
        alt: "GreenBubble - Multi-model AI chat with no lock-in. ChatGPT alternative powered by OpenRouter.",
      },
    ],
  },
};

function StructuredDataScripts() {
  const data = [organizationStructuredData, productStructuredData];

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export default function HomePage() {
  return (
    <>
      <LandingPageClient />
      <StructuredDataScripts />
    </>
  );
}
