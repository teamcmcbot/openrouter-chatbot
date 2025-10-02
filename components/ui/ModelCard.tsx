"use client";

import Link from "next/link";
import type { ModelCatalogClientEntry } from "../../lib/types/modelCatalog";

const badgeClasses = "inline-flex items-center px-2 py-0.5 text-xs font-medium rounded";

interface ModelCardProps {
  model: ModelCatalogClientEntry;
}

/**
 * Mobile-optimized card view for model catalog entries.
 * Displays all model information in a vertical layout optimized for narrow viewports.
 * Used on screens < 768px width.
 */
export default function ModelCard({ model }: Readonly<ModelCardProps>) {
  const { flags, pricing, tiers } = model;

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4 space-y-3 hover:border-emerald-500 dark:hover:border-emerald-400 transition-colors">
      {/* Header: Model Name + ID */}
      <div className="space-y-1">
        <Link
          href={`/models/${encodeURIComponent(model.id)}`}
          className="block text-base font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 hover:underline"
        >
          {model.name}
        </Link>
        <code className="block text-xs text-gray-500 dark:text-gray-400 truncate">
          {model.id}
        </code>
      </div>

      {/* Capability Badges */}
      {(flags.isFree || flags.isPaid || flags.multimodal || flags.reasoning || flags.image) && (
        <div className="flex flex-wrap gap-1.5">
          {flags.isFree && (
            <span className={`${badgeClasses} bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300`}>
              FREE
            </span>
          )}
          {flags.isPaid && (
            <span className={`${badgeClasses} bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300`}>
              PAID
            </span>
          )}
          {flags.multimodal && (
            <span className={`${badgeClasses} bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 border border-purple-200 dark:border-purple-700`}>
              MM
            </span>
          )}
          {flags.reasoning && (
            <span className={`${badgeClasses} bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300`}>
              R1
            </span>
          )}
          {flags.image && (
            <span className={`${badgeClasses} bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300 border border-pink-200 dark:border-pink-700`}>
              IMAGE GEN
            </span>
          )}
        </div>
      )}

      {/* Description */}
      {model.description && (
        <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
          {model.description}
        </p>
      )}

      {/* Key Info Grid - 2 columns */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm border-t border-gray-200 dark:border-gray-800 pt-3">
        {/* Context Length */}
        <div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Context</div>
          <div className="font-medium text-gray-900 dark:text-gray-50">
            {model.contextDisplay}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">tokens</div>
        </div>

        {/* Provider */}
        <div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Provider</div>
          <div className="font-medium text-gray-900 dark:text-gray-50">
            {model.provider.label}
          </div>
        </div>

        {/* Input Price */}
        <div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Input Price</div>
          <div className="font-medium text-gray-900 dark:text-gray-50">
            {pricing.promptDisplay}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{pricing.promptUnit}</div>
        </div>

        {/* Output Price */}
        <div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Output Price</div>
          <div className="font-medium text-gray-900 dark:text-gray-50">
            {pricing.completionDisplay}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{pricing.completionUnit}</div>
        </div>
      </div>

      {/* Image Pricing (if applicable) */}
      {pricing.imageDisplay && (
        <div className="border-t border-gray-200 dark:border-gray-800 pt-2">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Image Generation</div>
          <div className="text-sm">
            <span className="font-medium text-gray-900 dark:text-gray-50">
              {pricing.imageDisplay}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">
              {pricing.imageUnit}
            </span>
          </div>
        </div>
      )}

      {/* Modalities */}
      {model.modalities && model.modalities.length > 0 && (
        <div className="border-t border-gray-200 dark:border-gray-800 pt-2">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Modalities</div>
          <div className="flex flex-wrap gap-1">
            {model.modalities.map((modality, idx) => (
              <span
                key={`${modality}-${idx}`}
                className="inline-flex items-center px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded"
              >
                {modality}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tier Access */}
      <div className="flex gap-4 text-xs border-t border-gray-200 dark:border-gray-800 pt-2">
        <span
          className={
            tiers.free
              ? "text-emerald-600 dark:text-emerald-400 font-medium"
              : "text-gray-400 dark:text-gray-600"
          }
        >
          {tiers.free ? "✓" : "✗"} Base
        </span>
        <span
          className={
            tiers.pro
              ? "text-emerald-600 dark:text-emerald-400 font-medium"
              : "text-gray-400 dark:text-gray-600"
          }
        >
          {tiers.pro ? "✓" : "✗"} Pro
        </span>
        <span
          className={
            tiers.enterprise
              ? "text-emerald-600 dark:text-emerald-400 font-medium"
              : "text-gray-400 dark:text-gray-600"
          }
        >
          {tiers.enterprise ? "✓" : "✗"} Enterprise
        </span>
      </div>

      {/* Action Link */}
      <Link
        href={`/models/${encodeURIComponent(model.id)}`}
        className="inline-flex items-center text-sm text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 font-medium hover:underline"
      >
        View Details
        <svg className="ml-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </Link>
    </div>
  );
}
