"use client";

import { useSettingsStore } from "../../stores/useSettingsStore";
import { useState, useEffect } from "react";

interface StreamingToggleProps {
  className?: string;
  label?: string;
  description?: string;
}

export function StreamingToggle({ 
  className = "", 
  label = "Enable Streaming",
  description = "Stream responses in real-time for faster interaction"
}: StreamingToggleProps) {
  const { getSetting, setSetting } = useSettingsStore();
  const [enabled, setEnabled] = useState(false);

  // Load setting on mount
  useEffect(() => {
    const streamingEnabled = Boolean(getSetting('streamingEnabled', false));
    setEnabled(streamingEnabled);
  }, [getSetting]);

  const handleToggle = () => {
    const newValue = !enabled;
    setEnabled(newValue);
    setSetting('streamingEnabled', newValue);
  };

  return (
    <div className={`${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <label htmlFor="streaming-toggle" className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {label}
          </label>
          {description && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {description}
            </p>
          )}
        </div>
        <button
          id="streaming-toggle"
          type="button"
          onClick={handleToggle}
          className={`${
            enabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
          } relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800`}
          aria-pressed={enabled}
          aria-label={label}
        >
          <span
            className={`${
              enabled ? 'translate-x-6' : 'translate-x-1'
            } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
          />
        </button>
      </div>
    </div>
  );
}
