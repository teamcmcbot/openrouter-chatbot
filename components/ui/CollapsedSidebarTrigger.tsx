/**
 * CollapsedSidebarTrigger Component
 *
 * A thin vertical trigger bar shown when the ModelDetailsSidebar is collapsed on desktop.
 * Provides a subtle, accessible way to re-expand the sidebar.
 *
 * Design:
 * - 10px wide vertical bar with chevron icon
 * - Hover effect expands to 40px with "Show Details" text
 * - Smooth transitions for professional feel
 * - Keyboard accessible (Tab, Enter/Space)
 */

import React from "react";
import { ChevronLeftIcon } from "@heroicons/react/24/outline";

interface CollapsedSidebarTriggerProps {
  onExpand: () => void;
}

export default function CollapsedSidebarTrigger({
  onExpand,
}: CollapsedSidebarTriggerProps) {
  return (
    <button
      onClick={onExpand}
      className="group h-full w-10 
                 bg-slate-50 dark:bg-gray-800 
                 hover:bg-gray-100 dark:hover:bg-gray-700 
                 border-l border-gray-200 dark:border-gray-700 
                 flex flex-col items-center justify-center gap-2 
                 transition-all duration-200 ease-in-out
                 cursor-pointer
                 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
      aria-label="Show model details"
      aria-expanded="false"
      title="Show model details sidebar"
    >
      {/* Chevron Icon - Always visible */}
      <ChevronLeftIcon
        className="w-5 h-5 text-gray-500 dark:text-gray-400 
                   group-hover:text-gray-700 dark:group-hover:text-gray-200 
                   transition-colors"
        aria-hidden="true"
      />

      {/* Vertical Text - Visible on hover */}
      <span
        className="text-xs text-gray-500 dark:text-gray-400 
                   group-hover:text-gray-700 dark:group-hover:text-gray-200 
                   [writing-mode:vertical-rl] tracking-wider
                   opacity-0 group-hover:opacity-100 transition-opacity duration-200"
        aria-hidden="true"
      >
        DETAILS
      </span>
    </button>
  );
}
