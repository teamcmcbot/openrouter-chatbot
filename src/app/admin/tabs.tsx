"use client";
import React, { useState } from 'react';

type Tab = { id: string; label: string; content: React.ReactNode };

export default function ClientTabs({ tabs, defaultTab }: { tabs: Tab[]; defaultTab?: string }) {
  const [active, setActive] = useState(defaultTab || tabs[0]?.id);
  return (
    <div className="space-y-3">
  <div className="flex border-b border-gray-200 dark:border-gray-800">
        {tabs.map(t => (
          <button
            key={t.id}
    className={`px-4 py-2 -mb-px border-b-2 transition-colors ${active === t.id ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-gray-600 hover:text-emerald-600'}`}
            onClick={() => setActive(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div>{tabs.find(t => t.id === active)?.content}</div>
    </div>
  );
}
