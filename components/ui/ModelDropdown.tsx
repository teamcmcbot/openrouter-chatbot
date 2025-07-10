"use client";

import { useState, useRef, useEffect } from "react";
import { ModelInfo } from "../../lib/types/openrouter";

interface ModelDropdownProps {
  readonly models: ModelInfo[] | string[];
  readonly selectedModel: string;
  readonly onModelSelect: (model: string) => void;
  readonly isLoading?: boolean;
  readonly enhanced?: boolean;
}

// Type guard to check if models are enhanced
const isEnhancedModels = (models: ModelInfo[] | string[]): models is ModelInfo[] => {
  return models.length > 0 && typeof models[0] === 'object' && 'name' in models[0];
};

export default function ModelDropdown({ 
  models, 
  selectedModel, 
  onModelSelect, 
  isLoading = false,
  enhanced 
}: ModelDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Determine if we have enhanced data
  const hasEnhancedData = enhanced ?? isEnhancedModels(models);

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

  // Handle keyboard navigation
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!isOpen) return;

      switch (event.key) {
        case 'Escape':
          setIsOpen(false);
          break;
        case 'ArrowDown':
          event.preventDefault();
          // Focus management could be implemented here for full keyboard navigation
          break;
        case 'ArrowUp':
          event.preventDefault();
          // Focus management could be implemented here for full keyboard navigation
          break;
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleModelSelect = (modelId: string) => {
    onModelSelect(modelId);
    setIsOpen(false);
  };

  // Enhanced display name function
  const getDisplayName = (model: ModelInfo | string): string => {
    if (hasEnhancedData && typeof model === 'object') {
      return model.name;
    }
    
    // Fallback to formatted model ID for legacy mode
    const modelId = typeof model === 'string' ? model : model.id;
    return modelId
      .replace(/^(gpt-|claude-|llama-)/i, "")
      .replace(/-/g, " ")
      .replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const getModelId = (model: ModelInfo | string): string => {
    return typeof model === 'string' ? model : model.id;
  };

  const getSelectedModelDisplay = (): string => {
    if (hasEnhancedData && isEnhancedModels(models)) {
      const selectedModelData = models.find(model => model.id === selectedModel);
      return selectedModelData ? selectedModelData.name : "Select Model";
    }
    
    // Legacy mode
    return getDisplayName(selectedModel) || "Select Model";
  };

  const getModelDescription = (model: ModelInfo | string): string | null => {
    if (hasEnhancedData && typeof model === 'object') {
      return model.description;
    }
    return null;
  };

  const getContextLength = (model: ModelInfo | string): number | null => {
    if (hasEnhancedData && typeof model === 'object') {
      return model.context_length;
    }
    return null;
  };

  const formatContextLength = (contextLength: number): string => {
    if (contextLength >= 1000000) {
      return `${(contextLength / 1000000).toFixed(1)}M`;
    } else if (contextLength >= 1000) {
      return `${(contextLength / 1000).toFixed(0)}K`;
    }
    return contextLength.toString();
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className="flex items-center gap-1.5 px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors duration-200 border border-gray-200 dark:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label="Select AI model"
      >
        {isLoading ? (
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 border border-gray-300 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-gray-700 dark:text-violet-300 font-normal text-xs leading-tight">
              Loading...
            </span>
          </div>
        ) : (
          <span className="text-gray-700 dark:text-violet-300 font-normal text-xs leading-tight">
            {getSelectedModelDisplay()}
          </span>
        )}
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

      {isOpen && !isLoading && (
        <div className="absolute top-full right-0 mt-1 w-72 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded shadow-lg z-50 max-h-64 overflow-auto">
          <div className="py-1">
            {models.map((model) => {
              const modelId = getModelId(model);
              const displayName = getDisplayName(model);
              const description = getModelDescription(model);
              const contextLength = getContextLength(model);
              const isSelected = modelId === selectedModel;

              return (
                <button
                  key={modelId}
                  onClick={() => handleModelSelect(modelId)}
                  className={`w-full text-left px-2.5 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-150 ${
                    isSelected
                      ? "bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300"
                      : "text-gray-700 dark:text-gray-300"
                  }`}
                  type="button"
                  aria-label={`Select ${displayName} model`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-xs leading-tight truncate">
                          {displayName}
                        </span>
                        {contextLength && (
                          <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded text-[10px] font-mono">
                            {formatContextLength(contextLength)}
                          </span>
                        )}
                      </div>
                      {hasEnhancedData && description && (
                        <div className="text-gray-500 dark:text-gray-400 text-[10px] mt-0.5 leading-tight overflow-hidden"
                             style={{
                               display: '-webkit-box',
                               WebkitLineClamp: 2,
                               WebkitBoxOrient: 'vertical'
                             }}>
                          {description}
                        </div>
                      )}
                      <div className="text-gray-500 dark:text-gray-400 text-[10px] mt-0.5 font-mono leading-tight">
                        {modelId}
                      </div>
                    </div>
                    {isSelected && (
                      <svg className="w-2.5 h-2.5 text-violet-600 dark:text-violet-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
