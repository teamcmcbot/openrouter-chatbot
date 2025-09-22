// src/app/not-found.tsx
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">404 – Page not found</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          The page you’re looking for doesn’t exist or has been moved.
        </p>
        <Link href="/" className="inline-block mt-4 text-emerald-600 hover:underline">
          Go back home
        </Link>
      </div>
    </div>
  );
}
