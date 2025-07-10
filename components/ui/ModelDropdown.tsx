"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { ModelInfo } from "../../lib/types/openrouter";

interface ModelDropdownProps {
  readonly models: ModelInfo[] | string[];
  readonly selectedModel: string;
  readonly onModelSelect: (model: string) => void;
  readonly isLoading?: boolean;
  readonly enhanced?: boolean;
  readonly onShowDetails?: (model: ModelInfo) => void;
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
  enhanced,
  onShowDetails
}: ModelDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterBy, setFilterBy] = useState<'all' | 'free' | 'multimodal' | 'reasoning'>('all');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Determine if we have enhanced data
  const hasEnhancedData = enhanced ?? isEnhancedModels(models);

  // Filter and search models
  const filteredModels = useMemo(() => {
    let filtered = [...models];

    // Apply category filter for enhanced models
    if (hasEnhancedData && filterBy !== 'all') {
      const enhancedModels = models as ModelInfo[];
      filtered = enhancedModels.filter(model => {
        switch (filterBy) {
          case 'free':
            return parseFloat(model.pricing.prompt) === 0 && parseFloat(model.pricing.completion) === 0;
          case 'multimodal':
            return model.input_modalities.length > 1 || model.output_modalities.length > 1;
          case 'reasoning':
            return model.supported_parameters.includes('reasoning');
          default:
            return true;
        }
      }) as typeof models;
    }

    // Apply search filter
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase();
      if (hasEnhancedData) {
        const enhancedFiltered = filtered as ModelInfo[];
        filtered = enhancedFiltered.filter(model => (
          model.name.toLowerCase().includes(search) ||
          model.id.toLowerCase().includes(search) ||
          model.description.toLowerCase().includes(search)
        )) as typeof models;
      } else {
        const stringFiltered = filtered as string[];
        filtered = stringFiltered.filter(modelId => 
          modelId.toLowerCase().includes(search)
        ) as typeof models;
      }
    }

    return filtered;
  }, [models, searchTerm, filterBy, hasEnhancedData]);

  // Handle showing model details
  const handleShowDetails = (model: ModelInfo) => {
    if (onShowDetails) {
      onShowDetails(model);
    }
  };

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

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
        <div className="absolute top-full right-0 mt-1 w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-50 max-h-96 overflow-hidden">
          {/* Search and Filter Header */}
          <div className="p-3 border-b border-gray-200 dark:border-gray-700">
            {/* Search Input */}
            <div className="relative mb-3">
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search models..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <svg className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            {/* Filter Buttons (only for enhanced models) */}
            {hasEnhancedData && (
              <div className="flex gap-1 flex-wrap">
                {(['all', 'free', 'multimodal', 'reasoning'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setFilterBy(filter)}
                    className={`px-2 py-1 text-xs rounded-md transition-colors ${
                      filterBy === filter
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
                    }`}
                  >
                    {filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Models List */}
          <div className="overflow-y-auto max-h-72">
            {filteredModels.length === 0 ? (
              <div className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400 text-center">
                No models found matching your criteria
              </div>
            ) : (
              <div className="py-1">
                {filteredModels.map((model) => {
                  const modelId = getModelId(model);
                  const displayName = getDisplayName(model);
                  const description = getModelDescription(model);
                  const contextLength = getContextLength(model);
                  const isSelected = modelId === selectedModel;
                  const isEnhanced = hasEnhancedData && typeof model === 'object';

                  return (
                    <div key={modelId} className="group">
                      <button
                        onClick={() => handleModelSelect(modelId)}
                        className={`w-full text-left px-3 py-2.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-150 ${
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
                                <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-[10px] font-mono">
                                  {formatContextLength(contextLength)}
                                </span>
                              )}
                              {isEnhanced && (
                                <div className="flex gap-1">
                                  {/* Free badge */}
                                  {parseFloat((model as ModelInfo).pricing.prompt) === 0 && 
                                   parseFloat((model as ModelInfo).pricing.completion) === 0 && (
                                    <span className="text-[9px] bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 px-1 py-0.5 rounded">
                                      FREE
                                    </span>
                                  )}
                                  {/* Multimodal badge */}
                                  {(model as ModelInfo).input_modalities.length > 1 && (
                                    <span className="text-[9px] bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 px-1 py-0.5 rounded">
                                      MM
                                    </span>
                                  )}
                                  {/* Reasoning badge */}
                                  {(model as ModelInfo).supported_parameters.includes('reasoning') && (
                                    <span className="text-[9px] bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300 px-1 py-0.5 rounded">
                                      R1
                                    </span>
                                  )}
                                </div>
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
                          <div className="flex items-center gap-1">
                            {/* Details button for enhanced models */}
                            {isEnhanced && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleShowDetails(model as ModelInfo);
                                }}
                                className="p-1 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-all"
                                aria-label="View model details"
                                title="View details"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              </button>
                            )}
                            {/* Selected checkmark */}
                            {isSelected && (
                              <svg className="w-3 h-3 text-violet-600 dark:text-violet-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path
                                  fillRule="evenodd"
                                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            )}
                          </div>
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Results count */}
          {filteredModels.length > 0 && (
            <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
              {filteredModels.length} model{filteredModels.length !== 1 ? 's' : ''} available
            </div>
          )}
        </div>
      )}
    </div>
  );
}
