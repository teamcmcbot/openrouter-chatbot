"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Image from "next/image";
import { fetchSignedUrl } from "../../lib/utils/signedUrlCache";

interface InlineAttachmentProps {
  id: string;
  alt?: string;
  onClick?: () => void;
  // Optional size override
  width?: number;
  height?: number;
  // Optional className for responsive sizing
  className?: string;
}

export default function InlineAttachment({ id, alt, onClick, width, height, className = "" }: Readonly<InlineAttachmentProps>) {
  const [url, setUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);
  const fetchedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

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
    <div
      ref={containerRef}
      className={`relative rounded-md overflow-hidden border border-white/80 dark:border-white/80 bg-gray-100 dark:bg-gray-800 shadow-sm ${className}`}
      style={width && height ? { width, height } : undefined}
    >
      {isLoading && (
        <div className="w-full h-full animate-pulse bg-gray-200 dark:bg-gray-700" />
      )}
      {!isLoading && error && (
        <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-500">Image</div>
      )}
      {!isLoading && !error && url && (
        <button
          type="button"
          title={alt || "Open image"}
          onClick={onClick}
          className="block w-full h-full cursor-pointer"
        >
          <Image
            src={url}
            alt={alt || "Attachment"}
            width={width || 96}
            height={height || 96}
            className="w-full h-full object-cover ring-1 ring-white/70"
            onError={handleError}
            sizes={width ? `${width}px` : "96px"}
          />
        </button>
      )}
    </div>
  );
}
