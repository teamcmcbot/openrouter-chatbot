import Link from "next/link";
import { FunnelIcon } from "@heroicons/react/24/outline";

interface PopularFilterLink {
  label: string;
  href: string;
  count: number;
  description: string;
}

interface PopularFiltersProps {
  links: PopularFilterLink[];
}

/**
 * Server-rendered popular filter links for SEO discoverability.
 * Provides crawlable URLs to common filter combinations with dynamic counts.
 */
export default function PopularFilters({ links }: Readonly<PopularFiltersProps>) {
  return (
    <section className="mt-16 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <FunnelIcon className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-50">
          Popular Filters
        </h2>
      </div>
      
      <p className="text-gray-600 dark:text-gray-300 mb-6 text-center">
        Jump to commonly searched model categories and providers
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="group block p-5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-md transition-all"
          >
            <div className="flex items-start justify-between mb-2">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-50 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                {link.label}
              </h3>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
                {link.count}
              </span>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
              {link.description}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
