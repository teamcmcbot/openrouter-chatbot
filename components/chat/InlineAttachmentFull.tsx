"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Image from "next/image";
import { fetchSignedUrl } from "../../lib/utils/signedUrlCache";

interface InlineAttachmentFullProps {
  id: string;
  alt?: string;
  onClick?: () => void;
}

export default function InlineAttachmentFull({ id, alt, onClick }: Readonly<InlineAttachmentFullProps>) {
  const [url, setUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);
  const fetchedRef = useRef(false);
  const containerRef = useRef<HTMLButtonElement | null>(null);

  const loadUrl = useCallback(async () => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setIsLoading(true);
    setError(false);
    try {
      const u = await fetchSignedUrl(id);
      setUrl(u);
    } catch {
      setError(true);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  // Lazy fetch when entering viewport
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;

    // If IntersectionObserver is not available, fetch immediately
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      void loadUrl();
      return;
    }

    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          void loadUrl();
          io.disconnect();
          break;
        }
      }
    }, { root: null, rootMargin: '200px', threshold: 0.01 });

    io.observe(el);
    return () => io.disconnect();
  }, [loadUrl]);

  const handleError = async () => {
    // Try to refresh the signed URL if it expired
    try {
      const u = await fetchSignedUrl(id);
      setUrl(u);
      setError(false);
    } catch {
      setError(true);
    }
  };

  return (
    <button
      ref={containerRef}
      type="button"
      onClick={onClick}
      className="group relative text-left rounded-lg overflow-hidden border border-slate-300 dark:border-slate-600 bg-white dark:bg-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer mx-auto max-w-full"
      title="Click to view full size"
    >
      {isLoading && (
        <div className="w-full h-64 animate-pulse bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
          <span className="text-sm text-gray-500">Loading...</span>
        </div>
      )}
      {!isLoading && error && (
        <div className="w-full h-32 flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-500">
          <span className="text-sm">Image unavailable</span>
        </div>
      )}
      {!isLoading && !error && url && (
        <>
          <Image
            src={url}
            alt={alt || "Attachment"}
            width={800}
            height={600}
            className="max-w-full h-auto max-h-[480px] object-contain bg-black/5 dark:bg-white/5 transition-opacity group-hover:opacity-95 mx-auto"
            onError={handleError}
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 90vw, 80vw"
          />
          <span className="absolute bottom-2 right-2 bg-black/50 text-white text-[11px] px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">Open</span>
        </>
      )}
    </button>
  );
}
