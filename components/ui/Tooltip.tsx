"use client";

import { useEffect, useId, useRef, useState } from "react";

interface TooltipProps {
  children: React.ReactNode; // trigger content
  content: React.ReactNode; // tooltip body
  className?: string; // wrapper classes
  side?: "top" | "bottom" | "left" | "right";
  widthClassName?: string; // e.g., w-72 sm:w-80
  offset?: number; // px offset for placement
  // Accessibility
  ariaLabel?: string;
}

// Lightweight, accessible tooltip. Opens on hover/focus, can be pinned with Enter/Space, closes with Escape.
export default function Tooltip({
  children,
  content,
  className = "",
  side = "top",
  widthClassName = "w-72 sm:w-80",
  offset = 8,
  ariaLabel,
}: TooltipProps) {
  const id = useId();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!wrapperRef.current) return;
      if (e.key === "Escape") {
        setPinned(false);
        setOpen(false);
      }
    };
    if (open) {
      window.addEventListener("keydown", onKey);
    }
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const posClass =
    side === "top"
      ? `left-0 -top-${offset} -translate-y-full`
      : side === "bottom"
      ? `left-0 -bottom-${offset} translate-y-full`
      : side === "left"
      ? `-left-${offset} top-0 -translate-x-full`
      : `-right-${offset} top-0 translate-x-full`;

  return (
    <div
      ref={wrapperRef}
      className={`relative inline-block group ${className}`}
      tabIndex={0}
      onFocus={() => setOpen(true)}
      onBlur={() => !pinned && setOpen(false)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => !pinned && setOpen(false)}
      aria-describedby={id}
    >
      {/* Trigger */}
      <div
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setPinned((v) => {
              const next = !v;
              if (!next) setOpen(false);
              else setOpen(true);
              return next;
            });
          }
        }}
      >
        {children}
      </div>

      {/* Tooltip body */}
      <div
        id={id}
        role="tooltip"
        aria-label={ariaLabel}
        className={`pointer-events-none absolute ${widthClassName} z-20 rounded-lg border border-gray-200/60 dark:border-white/10 bg-white/95 dark:bg-gray-900/95 text-gray-900 dark:text-gray-100 p-3 text-xs shadow-xl transition-opacity ${
          open ? "opacity-100" : "opacity-0"
        } ${posClass}`}
      >
        {content}
      </div>
    </div>
  );
}
