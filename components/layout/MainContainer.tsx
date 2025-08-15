"use client";

import React from "react";
import { usePathname } from "next/navigation";

export default function MainContainer({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isChat = pathname === "/chat" || pathname === "/";
  const minHClass = isChat ? "min-h-0" : "";
  return (
    <main className={`flex-1 ${minHClass} bg-slate-50 dark:bg-gray-900`}>{children}</main>
  );
}
