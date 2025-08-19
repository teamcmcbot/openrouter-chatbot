"use client";

import { XMarkIcon } from "@heroicons/react/24/outline";
import { sanitizeAttachmentName, fallbackImageLabel } from "../../lib/utils/sanitizeAttachmentName";

export type AttachmentStatus = "uploading" | "failed" | "ready";

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
  const idOrTemp = data.tempId || data.id || String(index);

  return (
    <div
      className={`relative group rounded-md overflow-hidden border ${failed ? "border-red-400" : "border-gray-200 dark:border-gray-600"} ${className} shrink-0 snap-start`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={data.previewUrl}
        alt={label}
        className="w-full h-full object-cover opacity-100"
        draggable={false}
      />

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {uploading && (
          <div className="text-[10px] bg-black/50 text-white px-2 py-1 rounded">Uploading…</div>
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
        className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
      >
        <XMarkIcon className="w-4 h-4" />
      </button>
    </div>
  );
}
