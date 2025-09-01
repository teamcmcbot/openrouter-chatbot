"use client";

import { useEffect, useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { sanitizeAttachmentName, fallbackImageLabel } from "../../lib/utils/sanitizeAttachmentName";

export type AttachmentStatus = "uploading" | "failed" | "ready" | "deleting";

export interface AttachmentData {
  tempId: string;
  id?: string;
  mime: string;
  size: number;
  originalName?: string;
  previewUrl: string;
  status: AttachmentStatus;
}

interface AttachmentTileProps {
  data: AttachmentData;
  index: number;
  onRemove: (idOrTempId: string) => void;
  onRetry: (tempId: string) => void;
  className?: string;
}

export default function AttachmentTile({ data, index, onRemove, onRetry, className = "" }: Readonly<AttachmentTileProps>) {
  const label = sanitizeAttachmentName(data.originalName) || fallbackImageLabel(index);
  const failed = data.status === "failed";
  const uploading = data.status === "uploading";
  const deleting = data.status === "deleting";
  const idOrTemp = data.tempId || data.id || String(index);

  // Detect whether the environment supports hover; if not (mobile/touch),
  // we always show the remove button to compensate for lack of hover.
  const [hasHover, setHasHover] = useState(true);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    try {
      const mq = window.matchMedia("(hover: hover)");
      setHasHover(!!mq.matches);
      // Some devices can change hover capability (e.g., connecting a mouse)
      const handler = (e: MediaQueryListEvent) => setHasHover(!!e.matches);
      mq.addEventListener?.("change", handler);
      return () => mq.removeEventListener?.("change", handler);
    } catch {
      // default true (desktop-like)
      setHasHover(true);
    }
  }, []);

  return (
    <div
  className={`relative group rounded-md overflow-hidden border ${failed ? "border-red-400" : "border-gray-200 dark:border-gray-600"} ${className} shrink-0 snap-start cursor-pointer`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={data.previewUrl}
        alt={label}
        className={`w-full h-full object-cover opacity-100 ${deleting ? 'grayscale-[60%] opacity-75' : ''}`}
        draggable={false}
      />

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {uploading && (
          <div className="text-[10px] bg-black/50 text-white px-2 py-1 rounded">Uploading…</div>
        )}
        {deleting && (
          <div className="text-[10px] bg-black/50 text-white px-2 py-1 rounded">Removing…</div>
        )}
        {failed && (
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] bg-red-500/80 text-white px-1.5 py-0.5 rounded">Upload failed</span>
            <button
              type="button"
              onClick={() => onRetry(data.tempId)}
              className="text-[10px] bg-black/60 text-white px-2 py-0.5 rounded hover:bg-black/70 pointer-events-auto"
            >
              Retry
            </button>
          </div>
        )}
      </div>

      <button
        type="button"
        aria-label="Remove image"
        onClick={() => onRemove(idOrTemp as string)}
        disabled={uploading || deleting}
        className={`absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5 transition
          ${hasHover ? 'opacity-0 group-hover:opacity-100 focus:opacity-100' : 'opacity-100'}
          ${uploading || deleting ? 'pointer-events-none opacity-60' : ''}`}
      >
        <XMarkIcon className="w-4 h-4" />
      </button>
    </div>
  );
}
