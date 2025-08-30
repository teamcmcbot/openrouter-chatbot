"use client";

import React from "react";
import { usePathname } from "next/navigation";

export default function MainContainer({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isChat = pathname === "/chat" || pathname === "/";
  // For chat pages, reserve space for header (all widths) and footer (from sm breakpoint)
  // so the MessageInput doesn't collide with the footer when it becomes visible at 640px.
  // Use Tailwind arbitrary values so the `sm:` variant actually applies in JIT:
  //   base: height: var(--mobile-content-height)  (100dvh - header)
  //   sm+:  height: var(--desktop-content-height) (100dvh - header - footer)
  const minHClass = isChat
  ? "min-h-0 h-[var(--mobile-content-height)] sm:h-[var(--desktop-content-height)]"
    : "";
  return (
    <main className={`flex-1 ${minHClass} bg-slate-50 dark:bg-gray-900`}>{children}</main>
  );
}
