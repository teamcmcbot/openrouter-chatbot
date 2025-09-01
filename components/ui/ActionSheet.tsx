"use client";

import { useEffect, useRef, ReactNode } from "react";

type ActionItem = {
  key: string;
  label: string;
  onSelect: () => void;
  destructive?: boolean;
};

interface ActionSheetProps {
  isOpen: boolean;
  title?: string;
  contextTitle?: string;
  contextSubtitle?: string;
  items: ActionItem[];
  onClose: () => void;
  children?: ReactNode; // optional custom content block above items
}

export default function ActionSheet({ isOpen, title, contextTitle, contextSubtitle, items, onClose, children }: ActionSheetProps) {
  const firstBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const prevActive = document.activeElement as HTMLElement | null;
    const timer = setTimeout(() => firstBtnRef.current?.focus(), 0);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", onKey);
      prevActive?.focus?.();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={title || "Actions"}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="relative z-10 w-full max-w-md mx-auto rounded-t-2xl bg-white dark:bg-gray-800 shadow-xl overflow-hidden">
        {(title || contextTitle) && (
          <div className="px-4 pt-4 pb-2">
            {title && (
              <div className="text-base font-semibold text-gray-900 dark:text-gray-100">
                {title}
              </div>
            )}
            {contextTitle && (
              <div className="mt-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 p-3">
                <div className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                  {contextTitle}
                </div>
                {contextSubtitle && (
                  <div className="mt-1 text-xs text-gray-600 dark:text-gray-300 truncate">
                    {contextSubtitle}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        <div className="p-2">
          {children}
          {items.map((item, idx) => (
            <button
              key={item.key}
              ref={idx === 0 ? firstBtnRef : undefined}
              onClick={() => {
                // Ensure sheet closes after selection
                item.onSelect();
              }}
              className={`w-full text-left px-4 py-3 rounded-lg mb-2 last:mb-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 transition-colors
                ${item.destructive
                  ? "bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-200 dark:hover:bg-red-900/40"
                  : "bg-gray-50 text-gray-800 hover:bg-gray-100 dark:bg-gray-700/50 dark:text-gray-100 dark:hover:bg-gray-700"}
              `}
            >
              {item.label}
            </button>
          ))}
          <button
            onClick={onClose}
            className="w-full text-left px-4 py-3 rounded-lg mt-2 mb-2 bg-white text-gray-800 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
