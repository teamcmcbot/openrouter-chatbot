"use client";

import { useEffect, useId, useRef, useState } from "react";

interface TooltipProps {
  children: React.ReactNode; // trigger content
  content: React.ReactNode; // tooltip body
  className?: string; // wrapper classes
  side?: "top" | "bottom" | "left" | "right";
  widthClassName?: string; // e.g., w-72 sm:w-80
  // Horizontal alignment when side is top/bottom
  // start: align left edges; end: align right edges
  align?: "start" | "end";
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
  align = "start",
  ariaLabel,
}: TooltipProps) {
  const id = useId();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);

  const OPEN_EVENT = "app:tooltip-open";

  const openAndAnnounce = () => {
    setOpen(true);
    try {
      window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: id }));
    } catch {
      // no-op in non-browser
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!wrapperRef.current) return;
      if (e.key === "Escape") {
        setPinned(false);
        setOpen(false);
      }
    };
    const onOtherOpen = (e: Event) => {
      const ce = e as CustomEvent<string>;
      // Dismiss if another tooltip (different id) opened
      if (ce.detail !== id) {
        setPinned(false);
        setOpen(false);
      }
    };
    if (open) {
      window.addEventListener("keydown", onKey);
    }
    window.addEventListener(OPEN_EVENT, onOtherOpen as EventListener);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOtherOpen as EventListener);
    };
  }, [open, id]);

  // Use stable Tailwind utilities for placement to avoid dynamic class generation issues
  const posClass =
    side === "top"
      ? `${align === "end" ? "right-0" : "left-0"} bottom-full mb-2`
      : side === "bottom"
      ? `${align === "end" ? "right-0" : "left-0"} top-full mt-2`
      : side === "left"
      ? "right-full top-1/2 -translate-y-1/2 mr-2"
      : "left-full top-1/2 -translate-y-1/2 ml-2";

  return (
    <div
      ref={wrapperRef}
      className={`relative inline-block group ${className}`}
      tabIndex={0}
      onFocus={() => openAndAnnounce()}
      onBlur={() => !pinned && setOpen(false)}
      onMouseEnter={() => openAndAnnounce()}
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
              else openAndAnnounce();
              return next;
            });
          }
        }}
        onClick={(e) => {
          e.stopPropagation();
          setPinned((v) => {
            const next = !v;
            if (!next) setOpen(false);
            else openAndAnnounce();
            return next;
          });
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
