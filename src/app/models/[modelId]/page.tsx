import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getModelById } from "../../../../lib/server/modelCatalog";

const siteUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
const brandName = process.env.BRAND_NAME || "OpenRouter Chatbot";

interface ModelDetailPageProps {
  params: Promise<{ modelId: string }>;
}

export async function generateMetadata({ params }: ModelDetailPageProps): Promise<Metadata> {
  const { modelId } = await params;
  const model = await getModelById(decodeURIComponent(modelId));

  if (!model) {
    return {
      title: `Model Not Found | ${brandName}`,
      description: "The requested model could not be found.",
    };
  }

  const canonicalUrl = `${siteUrl}/models/${encodeURIComponent(model.id)}`;
  const title = `${model.name} - ${model.provider.label} | ${brandName}`;
  const description = model.description
    ? `${model.description.slice(0, 150)}${model.description.length > 150 ? "..." : ""} - ${model.contextLength.toLocaleString()} tokens context, ${model.provider.label} provider.`
    : `${model.name} by ${model.provider.label}: ${model.contextLength.toLocaleString()} tokens context window. Available on ${Object.entries(model.tiers).filter(([, enabled]) => enabled).map(([tier]) => tier).join(", ")} tiers.`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: `${model.name} - ${model.provider.label}`,
      description,
      url: canonicalUrl,
      siteName: brandName,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${model.name} - ${model.provider.label}`,
      description,
    },
  };
}

export default async function ModelDetailPage({ params }: ModelDetailPageProps) {
  const { modelId } = await params;
  const model = await getModelById(decodeURIComponent(modelId));

  if (!model) {
    notFound();
  }

  const formatPrice = (price: string | null | undefined): string => {
    if (!price) return "N/A";
    const num = parseFloat(price);
    if (num === 0) return "Free";
    return `$${num.toFixed(6)}`;
  };

  const tierBadges = Object.entries(model.tiers)
    .filter(([, enabled]) => enabled)
    .map(([tier]) => tier);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-gray-500 dark:text-gray-400">
        <Link href="/models" className="hover:text-emerald-600 dark:hover:text-emerald-400">
          ← Back to Model Catalog
        </Link>
      </nav>

      {/* Header */}
      <header className="mb-8 pb-6 border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-gray-50 mb-2">
          {model.name}
        </h1>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
            {model.provider.label}
          </span>
          {tierBadges.map((tier) => (
            <span
              key={tier}
              className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold uppercase bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
            >
              {tier}
            </span>
          ))}
          {model.isModerated && (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
              Moderated
            </span>
          )}
        </div>
        <code className="text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
          {model.id}
        </code>
      </header>

      {/* Description */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-50 mb-4">Description</h2>
        <p className="text-base text-gray-700 dark:text-gray-300 leading-relaxed">
          {model.description}
        </p>
      </section>

      {/* Specifications */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-50 mb-4">Specifications</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              Context Window
            </h3>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-50">
              {model.contextLength > 0 ? model.contextLength.toLocaleString() : "N/A"}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">tokens</p>
          </div>

          {model.maxCompletionTokens && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                Max Completion Tokens
              </h3>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-50">
                {model.maxCompletionTokens.toLocaleString()}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">tokens</p>
            </div>
          )}

          {model.modalities.input.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                Input Modalities
              </h3>
              <div className="flex flex-wrap gap-2 mt-2">
                {model.modalities.input.map((modality) => (
                  <span
                    key={modality}
                    className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
                  >
                    {modality}
                  </span>
                ))}
              </div>
            </div>
          )}

          {model.modalities.output.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                Output Modalities
              </h3>
              <div className="flex flex-wrap gap-2 mt-2">
                {model.modalities.output.map((modality) => (
                  <span
                    key={modality}
                    className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
                  >
                    {modality}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {model.supportedParameters.length > 0 && (
          <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              Supported Parameters
            </h3>
            <div className="flex flex-wrap gap-2">
              {model.supportedParameters.map((param) => (
                <span
                  key={param}
                  className="inline-flex items-center px-3 py-1 rounded-md text-sm font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
                >
                  {param}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Pricing */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-50 mb-4">Pricing</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Price Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Rate
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Unit
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
              <tr>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-50">
                  Input (Prompt)
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                  {formatPrice(model.pricing.prompt)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  per 1M tokens
                </td>
              </tr>
              <tr>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-50">
                  Output (Completion)
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                  {formatPrice(model.pricing.completion)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  per 1M tokens
                </td>
              </tr>
              {model.pricing.request && parseFloat(model.pricing.request) > 0 && (
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-50">
                    Request
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                    {formatPrice(model.pricing.request)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    per request
                  </td>
                </tr>
              )}
              {model.pricing.image && parseFloat(model.pricing.image) > 0 && (
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-50">
                    Image (Input)
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                    {formatPrice(model.pricing.image)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    per 1M tokens
                  </td>
                </tr>
              )}
              {model.pricing.outputImage && parseFloat(model.pricing.outputImage) > 0 && (
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-50">
                    Image (Output)
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                    {formatPrice(model.pricing.outputImage)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    per 1M tokens
                  </td>
                </tr>
              )}
              {model.pricing.webSearch && parseFloat(model.pricing.webSearch) > 0 && (
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-50">
                    Web Search
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                    {formatPrice(model.pricing.webSearch)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    per query
                  </td>
                </tr>
              )}
              {model.pricing.internalReasoning && parseFloat(model.pricing.internalReasoning) > 0 && (
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-50">
                    Internal Reasoning
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                    {formatPrice(model.pricing.internalReasoning)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    per 1M tokens
                  </td>
                </tr>
              )}
              {model.pricing.cacheRead && parseFloat(model.pricing.cacheRead) > 0 && (
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-50">
                    Cache Read
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                    {formatPrice(model.pricing.cacheRead)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    per 1M tokens
                  </td>
                </tr>
              )}
              {model.pricing.cacheWrite && parseFloat(model.pricing.cacheWrite) > 0 && (
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-50">
                    Cache Write
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                    {formatPrice(model.pricing.cacheWrite)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    per 1M tokens
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Tier Availability */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-50 mb-4">Tier Availability</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className={`rounded-lg border p-6 ${model.tiers.free ? "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800" : "bg-gray-50 border-gray-200 dark:bg-gray-800/50 dark:border-gray-700"}`}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50 mb-2">Free</h3>
            <p className={`text-sm ${model.tiers.free ? "text-green-700 dark:text-green-300 font-medium" : "text-gray-500 dark:text-gray-400"}`}>
              {model.tiers.free ? "✓ Available" : "Not Available"}
            </p>
          </div>
          <div className={`rounded-lg border p-6 ${model.tiers.pro ? "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800" : "bg-gray-50 border-gray-200 dark:bg-gray-800/50 dark:border-gray-700"}`}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50 mb-2">Pro</h3>
            <p className={`text-sm ${model.tiers.pro ? "text-blue-700 dark:text-blue-300 font-medium" : "text-gray-500 dark:text-gray-400"}`}>
              {model.tiers.pro ? "✓ Available" : "Not Available"}
            </p>
          </div>
          <div className={`rounded-lg border p-6 ${model.tiers.enterprise ? "bg-purple-50 border-purple-200 dark:bg-purple-900/20 dark:border-purple-800" : "bg-gray-50 border-gray-200 dark:bg-gray-800/50 dark:border-gray-700"}`}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50 mb-2">Enterprise</h3>
            <p className={`text-sm ${model.tiers.enterprise ? "text-purple-700 dark:text-purple-300 font-medium" : "text-gray-500 dark:text-gray-400"}`}>
              {model.tiers.enterprise ? "✓ Available" : "Not Available"}
            </p>
          </div>
        </div>
      </section>

      {/* Footer navigation */}
      <footer className="mt-12 pt-6 border-t border-gray-200 dark:border-gray-700">
        <Link
          href="/models"
          className="inline-flex items-center text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 font-medium"
        >
          ← Back to Model Catalog
        </Link>
      </footer>
    </div>
  );
}
