"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { fetchSignedUrl } from "../../lib/utils/signedUrlCache";

interface InlineAttachmentProps {
  id: string;
  alt?: string;
  onClick?: () => void;
  // Optional size override
  width?: number;
  height?: number;
}

export default function InlineAttachment({ id, alt, onClick, width = 96, height = 96 }: Readonly<InlineAttachmentProps>) {
  const [url, setUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);

  const loadUrl = useCallback(async () => {
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

  useEffect(() => {
    void loadUrl();
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
      className="relative rounded-md overflow-hidden border border-white/80 dark:border-white/80 bg-gray-100 dark:bg-gray-800 shadow-sm"
      style={{ width, height }}
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
          className="block w-full h-full"
        >
          <Image
            src={url}
            alt={alt || "Attachment"}
            width={width}
            height={height}
            className="w-full h-full object-cover ring-1 ring-white/70"
            onError={handleError}
            sizes={`${width}px`}
          />
        </button>
      )}
    </div>
  );
}
