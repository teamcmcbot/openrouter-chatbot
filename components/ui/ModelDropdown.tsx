"use client";

import { useState, useRef, useEffect } from "react";

interface ModelDropdownProps {
  models: string[];
  selectedModel: string;
  onModelSelect: (model: string) => void;
}

export default function ModelDropdown({ models, selectedModel, onModelSelect }: ModelDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleModelSelect = (model: string) => {
    onModelSelect(model);
    setIsOpen(false);
  };

  const displayName = (model: string) => {
    // Format model names for better display
    return model
      .replace(/^(gpt-|claude-|llama-)/i, "")
      .replace(/-/g, " ")
      .replace(/\b\w/g, (l) => l.toUpperCase());
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors duration-200 border border-gray-200 dark:border-gray-600"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className="text-gray-700 dark:text-gray-300 font-normal text-xs leading-tight">
          {displayName(selectedModel) || "Select Model"}
        </span>
        <svg
          className={`w-2.5 h-2.5 text-gray-500 dark:text-gray-400 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded shadow-lg z-50 max-h-48 overflow-auto">
          <div className="py-1">
            {models.map((model) => (
              <button
                key={model}
                onClick={() => handleModelSelect(model)}
                className={`w-full text-left px-2.5 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-150 ${
                  model === selectedModel
                    ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                    : "text-gray-700 dark:text-gray-300"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-xs leading-tight">{displayName(model)}</span>
                  {model === selectedModel && (
                    <svg className="w-2.5 h-2.5 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </div>
                <div className="text-gray-500 dark:text-gray-400 text-xs mt-0.5 font-mono leading-tight">
                  {model}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
