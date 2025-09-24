"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";

// Utility to detect mobile devices
function isMobileDevice() {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}
import { ModelInfo } from "../../lib/types/openrouter";
import { InformationCircleIcon } from "@heroicons/react/24/outline";

interface ModelDropdownProps {
  readonly models: ModelInfo[] | string[];
  readonly selectedModel: string;
  readonly onModelSelect: (model: string) => void;
  readonly isLoading?: boolean;
  readonly onShowDetails?: (model: ModelInfo) => void;
  // NEW: controlled open state and preset filter
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly presetFilter?: 'all' | 'free' | 'paid' | 'multimodal' | 'reasoning' | 'image';
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
  onShowDetails,
  open,
  onOpenChange,
  presetFilter,
}: ModelDropdownProps) {
  // Controlled/uncontrolled open state
  const [isOpenInternal, setIsOpenInternal] = useState(false);
  const isOpen = typeof open === 'boolean' ? open : isOpenInternal;
  const setIsOpen = useCallback((next: boolean) => {
    if (onOpenChange) onOpenChange(next);
    else setIsOpenInternal(next);
  }, [onOpenChange]);

  const [searchTerm, setSearchTerm] = useState("");
  const [filterBy, setFilterBy] = useState<'all' | 'free' | 'paid' | 'multimodal' | 'reasoning' | 'image'>('all');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isSmallScreen, setIsSmallScreen] = useState<boolean>(false);
  const [fixedTop, setFixedTop] = useState<number>(0);
  const [panelMaxHeight, setPanelMaxHeight] = useState<number | null>(null);

  // Enhanced-only mode going forward; keep guard for safety during transition
  const hasEnhancedData = isEnhancedModels(models);

  // Apply preset filter when opened
  useEffect(() => {
    if (isOpen && presetFilter) {
      setFilterBy(presetFilter);
    }
  }, [isOpen, presetFilter]);

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
          case 'paid':
            return parseFloat(model.pricing.prompt) > 0 || parseFloat(model.pricing.completion) > 0;
          case 'multimodal':
            return model.input_modalities.length > 1 || model.output_modalities.length > 1;
          case 'reasoning':
            return model.supported_parameters.includes('reasoning');
          case 'image':
            return Array.isArray(model.output_modalities) && model.output_modalities.includes('image');
          default:
            return true;
        }
      }) as typeof models;
    }

    // Apply search filter
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase();
      const enhancedFiltered = filtered as ModelInfo[];
      filtered = enhancedFiltered.filter(model => (
        model.name.toLowerCase().includes(search) ||
        model.id.toLowerCase().includes(search) ||
        model.description.toLowerCase().includes(search)
      )) as typeof models;
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
    if (isOpen && searchInputRef.current && !isMobileDevice()) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // Track small screen (below 640px) to switch to fixed, centered popover
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 639px)');
    const update = () => setIsSmallScreen(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);

  // When opening on small screens, compute top position under trigger
  useEffect(() => {
    if (!isOpen) return;
    const btn = triggerRef.current;
    if (!btn) return;
    const computePositions = () => {
      const rect = btn.getBoundingClientRect();
      if (isSmallScreen) {
        setFixedTop(rect.bottom + 8); // 8px gap under trigger
      }
      // Compute dynamic max height so dropdown doesn't overlap the MessageInput
      try {
        const input = document.getElementById('message-input');
        const inputTop = input ? input.getBoundingClientRect().top : window.innerHeight - 12;
        const topStart = rect.bottom + 8; // matches the visual gap
        const available = Math.max(200, Math.floor(inputTop - topStart - 12));
        // Hard cap to a portion of viewport height for very tall screens
        const cap = Math.floor(window.innerHeight * 0.65);
        setPanelMaxHeight(Math.max(200, Math.min(available, cap)));
      } catch {
        setPanelMaxHeight(Math.floor(window.innerHeight * 0.65));
      }
    };
    computePositions();

    // Keep position/height in sync on resize/scroll/orientation change
    window.addEventListener('resize', computePositions);
    window.addEventListener('scroll', computePositions, { passive: true });
    window.addEventListener('orientationchange', computePositions);

    return () => {
      window.removeEventListener('resize', computePositions);
      window.removeEventListener('scroll', computePositions);
      window.removeEventListener('orientationchange', computePositions);
    };
  }, [isOpen, isSmallScreen]);

  // Close dropdown when clicking outside (ignore hidden instances)
  useEffect(() => {
    if (!isOpen) return;
    const el = dropdownRef.current;
    if (!el) return;
    // Only attach for visible instance
    const isVisible = () => {
      try {
        const rects = el.getClientRects();
        if (!rects || rects.length === 0) return false;
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
      } catch {
        return true;
      }
    };
    if (!isVisible()) return;

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        setIsOpen(false);
      }
    }

    // Use 'click' so item onClick runs before this listener
    document.addEventListener("click", handleClickOutside);
    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, [isOpen, setIsOpen]);

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
  }, [isOpen, setIsOpen]);

  const handleModelSelect = (modelId: string) => {
    onModelSelect(modelId);
    setIsOpen(false);
  };

  // Enhanced display name function
  const getDisplayName = (model: ModelInfo | string): string => {
  if (hasEnhancedData && typeof model === 'object') {
      return model.name;
    }
  // Fallback formatting no longer used; return safe value
  const modelId = typeof model === 'string' ? model : model.id;
  return modelId;
  };

  const getModelId = (model: ModelInfo | string): string => {
    return typeof model === 'string' ? model : model.id;
  };

  const getSelectedModelDisplay = (): string => {
  if (hasEnhancedData && isEnhancedModels(models)) {
      const selectedModelData = models.find(model => model.id === selectedModel);
      return selectedModelData ? selectedModelData.name : "Select Model";
    }
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
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
  className="flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm bg-emerald-50 dark:bg-gray-800 hover:bg-emerald-100 dark:hover:bg-gray-700 rounded-full transition-colors duration-200 border-2 border-emerald-500 dark:border-gray-600 dark:shadow-none focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 dark:focus-visible:ring-emerald-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label="Select AI model"
      >
        {isLoading ? (
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 border border-gray-300 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-gray-700 dark:text-violet-400 font-normal text-xs leading-tight">
              Loading...
            </span>
          </div>
        ) : (
          <span className="text-emerald-600 dark:text-emerald-400 font-normal text-xs leading-tight">
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
        <>
          {/* Mobile scrim overlay to focus attention on the popover */}
          {isSmallScreen && (
            <div
              className="fixed inset-0 z-[58] bg-black/20 dark:bg-black/40"
              role="presentation"
              onClick={() => setIsOpen(false)}
            />
          )}
        <div
          className={`${
            isSmallScreen
              ? 'fixed z-[60]'
              : 'absolute z-[60] top-full sm:left-0 sm:right-auto sm:translate-x-0'
          } ${
            isSmallScreen
              ? 'left-1/2 -translate-x-1/2'
              : ''
          } ${
            // width constraints: mobile uses viewport-constrained width; sm+ uses wider, breakpoint-based widths
            isSmallScreen
              ? 'w-[min(36rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)]'
              : 'w-[min(20rem,calc(100vw-2rem))] sm:w-[32rem] md:w-[36rem] lg:w-[40rem] xl:w-[44rem] max-w-[calc(100vw-2rem)]'
          } bg-gray-50 dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded-lg dark:shadow-lg ${isSmallScreen ? 'dark:shadow-2xl' : ''} overflow-hidden origin-top sm:origin-top-left flex flex-col`}
          style={{ ...(isSmallScreen ? { top: fixedTop } : {}), ...(panelMaxHeight ? { maxHeight: `${panelMaxHeight}px` } : {}) }}
        >
          {/* Search and Filter Header */}
          <div className="p-3 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10 bg-gray-50 dark:bg-gray-800">
            {/* Search Input */}
            <div className="relative mb-3">
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search models..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-400 focus:border-transparent"
              />
              <svg className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            {/* Filter Buttons (only for enhanced models) */}
            {hasEnhancedData && (
              <div
                className="flex gap-1 flex-nowrap whitespace-nowrap overflow-x-auto sm:flex-wrap sm:overflow-visible"
                aria-label="Model filters"
              >
                {(['all', 'free', 'paid', 'multimodal', 'reasoning', 'image'] as const).map((filter) => {
                  // Visible short labels for compact layout
                  const shortLabel =
                    filter === 'all'
                      ? 'All'
                      : filter === 'free'
                        ? 'Free'
                        : filter === 'paid'
                          ? 'Paid'
                          : filter === 'multimodal'
                            ? 'Multi'
                            : filter === 'reasoning'
                              ? 'Reason'
                              : 'Image'; // image

                  // Full titles for accessibility tooltips
                  const fullTitle =
                    filter === 'multimodal'
                      ? 'Multimodal'
                      : filter === 'reasoning'
                        ? 'Reasoning'
                        : filter === 'image'
                          ? 'Image generation'
                          : shortLabel;

                  return (
                    <button
                      key={filter}
                      onClick={() => setFilterBy(filter)}
                      title={fullTitle}
                      aria-label={`Filter: ${fullTitle} models`}
                      aria-pressed={filterBy === filter}
                      className={`text-[11px] leading-tight px-1.5 py-0.5 sm:text-xs sm:px-2 sm:py-1 rounded-md transition-colors ${
                        filterBy === filter
                          ? (
                              filter === 'multimodal'
                                ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
                                : filter === 'free'
                                  ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                                  : filter === 'image'
                                    ? 'bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300'
                                    : filter === 'reasoning'
                                      ? 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300'
                                      : 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                            )
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
                      }`}
                    >
                      {shortLabel}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Results count */}
            {filteredModels.length > 0 && (
              <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                {filteredModels.length} model{filteredModels.length !== 1 ? 's' : ''} available
              </div>
            )}
          </div>

          {/* Models List */}
          <div className="overflow-y-auto flex-1 pb-8">
            {filteredModels.length === 0 ? (
              <div className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400 text-center">
                No models found matching your criteria
              </div>
            ) : (
              <div className="py-1 pb-1 grid grid-cols-1 gap-1">
                {filteredModels.map((model) => {
                  const modelId = getModelId(model);
                  const displayName = getDisplayName(model);
                  const description = getModelDescription(model);
                  const contextLength = getContextLength(model);
                  const isSelected = modelId === selectedModel;
                  const isEnhanced = hasEnhancedData && typeof model === 'object';

                  return (
                    <div key={modelId} className="group">
                      <div
                        className={`w-full text-left px-3 py-2.5 lg:py-3 text-xs lg:text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-150 ${
                          isSelected
                            ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700 lg:border-l-2 lg:border-l-emerald-400"
                            : "text-gray-700 dark:text-gray-300"
                        } flex items-start justify-between gap-2 rounded-md lg:shadow-sm`}
                      >
                        <button
                          onClick={() => handleModelSelect(modelId)}
                          className="flex-1 min-w-0 text-left"
                          type="button"
                          aria-label={`Select ${displayName} model`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-xs lg:text-sm leading-tight truncate">
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
                                  <span className="text-[9px] bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 px-1 py-0.5 rounded border border-purple-200 dark:border-purple-700">
                                    MM
                                  </span>
                                )}
                                {/* Image Generation badge (output image support) */}
                                {(model as ModelInfo).output_modalities?.includes('image') && (
                                  <span className="text-[9px] bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300 px-1 py-0.5 rounded border border-pink-200 dark:border-pink-700">
                                    IMG
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
                            <div
                              className="text-gray-500 dark:text-gray-400 text-[10px] lg:text-xs mt-0.5 leading-tight overflow-hidden"
                              style={{
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical'
                              }}
                            >
                              {description}
                            </div>
                          )}
                          <div className="text-gray-500 dark:text-gray-400 text-[10px] mt-0.5 font-mono leading-tight">
                            {modelId}
                          </div>
                        </button>
                        
                        {/* Details area: place checkmark before info so info stays rightmost */}
                        <div className="flex items-center gap-1">
                          {/* Selected checkmark */}
                          {isSelected && (
                            <svg className="w-3 h-3 text-emerald-600 dark:text-emerald-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                          )}
                          {/* Details button for enhanced models - separated from main button */}
                          {isEnhanced && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleShowDetails(model as ModelInfo);
                              }}
                              className="p-1 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-all hover:cursor-pointer"
                              aria-label="View model details"
                              title="View details"
                            >
                              <InformationCircleIcon className="w-3 h-3" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

      {/* No longer showing results count at the footer - moved to header */}
  </div>
    </>
      )}
    </div>
  );
}

