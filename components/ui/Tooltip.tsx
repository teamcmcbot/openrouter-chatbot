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
  // Behavior
  closeOnOutsideClick?: boolean; // default true
  showCloseOnMobile?: boolean; // default true
  // Appearance: use a brand-tinted panel in light mode
  tinted?: boolean; // default true
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
  closeOnOutsideClick = true,
  showCloseOnMobile = true,
  tinted = true,
}: TooltipProps) {
  const id = useId();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [isTouch, setIsTouch] = useState(false);

  const OPEN_EVENT = "app:tooltip-open";

  const openAndAnnounce = () => {
    setOpen(true);
    try {
      window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: id }));
    } catch {
      // no-op in non-browser
    }
  };

  // Detect touch devices (coarse pointers)
  useEffect(() => {
    try {
      const coarse = typeof window !== 'undefined' && (('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0 || window.matchMedia('(pointer: coarse)').matches);
      setIsTouch(!!coarse);
    } catch {
      setIsTouch(false);
    }
  }, []);

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

  // Close on outside click/tap when open
  useEffect(() => {
    if (!open || !closeOnOutsideClick) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const el = wrapperRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) {
        setPinned(false);
        setOpen(false);
      }
    };
    const options: AddEventListenerOptions = { capture: true };
    document.addEventListener('pointerdown', onPointerDown, options);
    return () => document.removeEventListener('pointerdown', onPointerDown, options as EventListenerOptions);
  }, [open, closeOnOutsideClick]);

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
      onMouseEnter={() => { if (!isTouch) openAndAnnounce(); }}
      onMouseLeave={() => { if (!isTouch && !pinned) setOpen(false); }}
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
        className={`${open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'} absolute ${widthClassName} z-30 rounded-lg border 
          ${tinted ? 'border-emerald-200 bg-emerald-50/95 ring-1 ring-inset ring-emerald-100' : 'border-slate-300 bg-slate-50/95'}
          dark:border-white/10 dark:bg-gray-900/95 text-slate-900 dark:text-gray-100 p-3 text-sm shadow-2xl backdrop-blur-sm transition-opacity ${posClass}`}
      >
        {/* Mobile close button */}
        {isTouch && showCloseOnMobile && (
          <button
            type="button"
            aria-label="Close tooltip"
            className="absolute top-1.5 right-1.5 inline-flex h-6 w-6 items-center justify-center rounded-md text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10"
            onClick={(e) => { e.stopPropagation(); setPinned(false); setOpen(false); }}
          >
            <span aria-hidden>×</span>
          </button>
        )}
        {content}
      </div>
    </div>
  );
}
