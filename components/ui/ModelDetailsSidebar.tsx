"use client";

import { useState, useEffect, useRef } from "react";
import { ModelInfo } from "../../lib/types/openrouter";
import { GenerationData } from "../../lib/types/generation";
import { getGenerationFromCache, setGenerationInCache } from "../../lib/utils/generationCache";
import Button from "./Button";
import { InformationCircleIcon } from "@heroicons/react/24/outline";
import { logger } from "../../lib/utils/logger";

interface ModelDetailsSidebarProps {
  model: ModelInfo | null;
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'overview' | 'pricing' | 'capabilities';
  generationId?: string; // Add optional generation ID
  onGenerationHover?: (generationId: string | undefined) => void; // Add hover handler
  onGenerationClick?: (generationId: string) => void; // Add click handler for scrolling
  variant?: 'desktop' | 'mobile'; // Add variant to distinguish between desktop and mobile versions
}

// Format numbers for display
const formatNumber = (num: number): string => {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(0)}K`;
  }
  return num.toString();
};

// Format pricing for display based on pricing type
const formatPrice = (price: string, type: 'prompt' | 'completion' | 'image' | 'request' | 'web_search' | 'internal_reasoning' | 'input_cache_read' | 'input_cache_write'): string => {
  const num = parseFloat(price);
  if (num === 0) return "Free";
  
  // Format based on pricing type
  switch (type) {
    case 'prompt':
    case 'completion':
    case 'input_cache_read':
    case 'input_cache_write':
    case 'internal_reasoning':
      // Token-based pricing - display per 1M tokens
      return `$${(num * 1000000).toFixed(2)}/M tokens`;
    
    case 'image':
      // Image-based pricing - display per 1K images
      return `$${(num * 1000).toFixed(2)}/K images`;
    
    case 'request':
    case 'web_search':
      // Request-based pricing - display per request
      return `$${num.toFixed(6)}/request`;
    
    default:
      return `$${num.toFixed(6)}`;
  }
};

// Format date for display
const formatDate = (timestamp: number): string => {
  return new Date(timestamp * 1000).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

export function ModelDetailsSidebar({ model, isOpen, onClose, initialTab = 'overview', generationId, onGenerationHover, onGenerationClick, variant = 'desktop' }: ModelDetailsSidebarProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'pricing' | 'capabilities'>(initialTab);
  const [generationData, setGenerationData] = useState<GenerationData | null>(null);
  const [loadingGeneration, setLoadingGeneration] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [isGenerationIdHovered, setIsGenerationIdHovered] = useState(false);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  
  // Check if we're on desktop to prevent mobile version from making API calls
  const [isDesktop, setIsDesktop] = useState(false);
  
  // Track the last fetched generation ID to prevent duplicate calls - using ref for immediate updates
  const lastFetchedGenerationIdRef = useRef<string | null>(null);
  
  useEffect(() => {
    const checkDesktop = () => {
      setIsDesktop(window.matchMedia('(min-width: 1024px)').matches);
    };
    
    checkDesktop();
    const mediaQuery = window.matchMedia('(min-width: 1024px)');
    mediaQuery.addEventListener('change', checkDesktop);
    
    return () => mediaQuery.removeEventListener('change', checkDesktop);
  }, []);

  // Update active tab when initialTab changes
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // Reset description expanded state when model changes
  useEffect(() => {
    setIsDescriptionExpanded(false);
  }, [model?.id]);

  // Fetch generation data when generationId changes and we're on pricing tab
  useEffect(() => {
    // Use variant prop to determine which version should make API calls
    // Only the desktop variant should make API calls when on desktop screens
    // Only the mobile variant should make API calls when on mobile screens
    const shouldAllowFetch = isDesktop ? (variant === 'desktop') : (variant === 'mobile');
    
    // Prevent duplicate calls for the same generation ID
    const shouldFetch = generationId && 
                       activeTab === 'pricing' && 
                       isOpen && 
                       shouldAllowFetch && 
                       generationId !== lastFetchedGenerationIdRef.current;
    
    // First, attempt cache read to enable instant render on reopen
    if (generationId && activeTab === 'pricing' && isOpen && shouldAllowFetch) {
      const cached = getGenerationFromCache(generationId);
      if (cached) {
        setGenerationData(cached);
        setGenerationError(null);
        setLoadingGeneration(false);
        // We don't need a network call if cache is present
        lastFetchedGenerationIdRef.current = generationId;
        return;
      }
    }

    // Only fetch if all conditions are met and we haven't already fetched this generation ID
    if (shouldFetch) {
      lastFetchedGenerationIdRef.current = generationId;
      setLoadingGeneration(true);
      setGenerationError(null);
      
      fetch(`/api/generation/${generationId}`)
        .then(response => {
          if (!response.ok) {
            if (response.status === 404) {
              throw new Error('Generation details not found. This may be because the generation is too recent or not available via the API.');
            }
            throw new Error(`Failed to fetch generation data: ${response.statusText}`);
          }
          return response.json();
        })
        .then(data => {
          // Handle nested data structure from API response
          const generationData = data.data?.data || data.data;
          setGenerationData(generationData);
          try {
            // Persist to cache for instant reopen
            if (generationId) {
              setGenerationInCache(generationId, generationData);
            }
          } catch {}
          setLoadingGeneration(false);
        })
        .catch(error => {
          logger.warn('ui.modelDetails.fetchFailed', { err: (error as Error)?.message, generationId });
          setGenerationError(error.message);
          setLoadingGeneration(false);
        });
    } else {
      // Clear generation data when generationId changes to a different one or conditions not met
      if (generationId !== lastFetchedGenerationIdRef.current) {
        setGenerationData(null);
        setGenerationError(null);
      }
    }
  }, [generationId, activeTab, isOpen, isDesktop, model?.id, variant]);

  return (
    <>
      {/* Mobile Overlay */}
    {isOpen && (
        <div 
      className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      
      <aside
        className={`h-full mobile-safe-area bg-slate-50 dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 transition-all duration-300 ease-in-out overflow-hidden
          ${isOpen ? 'w-96' : 'w-0'}
      lg:relative lg:block lg:w-full
      ${isOpen ? 'fixed inset-y-0 right-0 z-50 lg:relative lg:z-auto' : 'hidden lg:block'}
        `}
        aria-labelledby="sidebar-title"
      >
        <div className="h-full flex flex-col">
          {!model ? (
            // Placeholder when no model is selected
            <>
              {/* Header for desktop with collapse button */}
              {variant === 'desktop' && (
                <div className="flex items-center justify-end p-5 border-b border-gray-200 dark:border-gray-700 h-16">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClose}
                    className="flex-shrink-0"
                    aria-label="Collapse sidebar"
                    title="Collapse sidebar"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Button>
                </div>
              )}
              <div className="flex flex-col items-center justify-center flex-1 p-6 text-center">
                <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                  <InformationCircleIcon className="w-8 h-8 text-gray-400" aria-hidden="true" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  Model Details
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
                  Click the info icon next to any model in the dropdown to view detailed information here.
                </p>
              </div>
            </>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700 h-20">
                <h2 
                  id="sidebar-title" 
                  className={`font-semibold text-gray-900 dark:text-white pr-2 leading-none ${
                    model.name.length > 30 ? 'text-sm' : 
                    model.name.length > 20 ? 'text-base' : 'text-lg'
                  }`}
                >
                  {model.name}
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  className="flex-shrink-0"
                  aria-label={variant === 'desktop' ? 'Collapse sidebar' : 'Close model details'}
                  title={variant === 'desktop' ? 'Collapse sidebar' : 'Close'}
                >
                  {variant === 'desktop' ? (
                    // Desktop: Right arrow icon for collapse
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  ) : (
                    // Mobile: X icon for close
                    '✕'
                  )}
                </Button>
              </div>

              {/* Tab Navigation */}
              <div className="flex border-b border-gray-200 dark:border-gray-700">
                {(['overview', 'pricing', 'capabilities'] as const).map((tab) => {
                  const getTabIcon = (tabName: string) => {
                    switch (tabName) {
                      case 'overview':
                        return (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        );
                      case 'pricing':
                        return (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                          </svg>
                        );
                      case 'capabilities':
                        return (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        );
                      default:
                        return null;
                    }
                  };

                  return (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`flex-1 py-3 px-2 flex items-center justify-center transition-colors ${
                        activeTab === tab
                          ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                          : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                      }`}
                      title={tab.charAt(0).toUpperCase() + tab.slice(1)}
                      aria-label={tab.charAt(0).toUpperCase() + tab.slice(1)}
                    >
                      {getTabIcon(tab)}
                    </button>
                  );
                })}
              </div>

              {/* Content Area */}
              <div className="flex-1 overflow-y-auto p-4">
                {/* Overview Tab */}
                {activeTab === 'overview' && (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Description</h3>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        {(() => {
                          const description = model.description || 'No description available.';
                          const shouldTruncate = description.length > 400;
                          const displayText = shouldTruncate && !isDescriptionExpanded 
                            ? description.slice(0, 400) + '...'
                            : description;
                          
                          return (
                            <>
                              <p>{displayText}</p>
                              {shouldTruncate && (
                                <button
                                  onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                                  className="mt-2 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm font-medium focus:outline-none focus:underline transition-colors"
                                >
                                  {isDescriptionExpanded ? 'See less' : 'See more'}
                                </button>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                    
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Basic Information</h3>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Model ID:</span>
                          <span className="font-mono text-sm text-gray-900 dark:text-white">{model.id}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Input:</span>
                          <span className="font-mono text-sm text-gray-900 dark:text-white">
                            {(() => {
                              const modalities = model.input_modalities || [];
                              const allowedModalities = modalities.filter((m: string) => 
                                m.toLowerCase() === 'text' || m.toLowerCase() === 'image'
                              );
                              
                              if (allowedModalities.length === 0) return 'Text';
                              
                              // Capitalize and sort with Text first
                              const capitalizedModalities = allowedModalities.map(m => 
                                m.charAt(0).toUpperCase() + m.slice(1).toLowerCase()
                              );
                              
                              // Ensure Text appears first if present
                              const sortedModalities = capitalizedModalities.sort((a, b) => {
                                if (a === 'Text') return -1;
                                if (b === 'Text') return 1;
                                return 0;
                              });
                              
                              return sortedModalities.join(', ');
                            })()}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Output:</span>
                          <span className="font-mono text-sm text-gray-900 dark:text-white">
                            {(() => {
                              const modalities = model.output_modalities || [];
                              const allowedModalities = modalities.filter((m: string) => 
                                m.toLowerCase() === 'text' || m.toLowerCase() === 'image'
                              );
                              
                              if (allowedModalities.length === 0) return 'Text';
                              
                              // Capitalize and sort with Text first
                              const capitalizedModalities = allowedModalities.map(m => 
                                m.charAt(0).toUpperCase() + m.slice(1).toLowerCase()
                              );
                              
                              // Ensure Text appears first if present
                              const sortedModalities = capitalizedModalities.sort((a, b) => {
                                if (a === 'Text') return -1;
                                if (b === 'Text') return 1;
                                return 0;
                              });
                              
                              return sortedModalities.join(', ');
                            })()}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Context Length:</span>
                          <span className="font-medium text-gray-900 dark:text-white">
                            {formatNumber(model.context_length)} tokens
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Created:</span>
                          <span className="font-medium text-gray-900 dark:text-white">
                            {model.created ? formatDate(model.created) : 'N/A'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Pricing Tab */}
                {activeTab === 'pricing' && (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Pricing</h3>
                      <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-4 space-y-2">
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Input:</span>
                          <span className="font-medium text-gray-900 dark:text-white">
                            {formatPrice(model.pricing.prompt, 'prompt')}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Output:</span>
                          <span className="font-medium text-gray-900 dark:text-white">
                            {formatPrice(model.pricing.completion, 'completion')}
                          </span>
                        </div>
                        {model.pricing.image && parseFloat(model.pricing.image) > 0 && (
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Image:</span>
                            <span className="font-medium text-gray-900 dark:text-white">
                              {formatPrice(model.pricing.image, 'image')}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Cost Estimate</h3>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        <p>1K input + 1K output tokens:</p>
                        <p className="font-medium text-gray-900 dark:text-white mt-1">
                          ${((parseFloat(model.pricing.prompt) + parseFloat(model.pricing.completion)) * 1000).toFixed(4)}
                        </p>
                      </div>
                    </div>

                    {/* Generation Details */}
                    {generationId && (
                      <div>
                        {/* Divider line */}
                        <div className="border-t border-gray-200 dark:border-gray-600 my-4"></div>
                        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Last Message:
                        </h3>
                        <p 
                          className={`text-xs mb-3 font-mono break-all transition-colors cursor-pointer ${
                            isGenerationIdHovered 
                              ? '!text-blue-600 dark:!text-blue-400' 
                              : 'text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400'
                          }`}
                          onMouseEnter={() => {
                            onGenerationHover?.(generationId);
                            setIsGenerationIdHovered(true);
                          }}
                          onMouseLeave={() => {
                            onGenerationHover?.(undefined);
                            setIsGenerationIdHovered(false);
                          }}
                          onClick={() => onGenerationClick?.(generationId)}
                          title="Click to scroll to message • Hover to highlight"
                        >
                          {generationId}
                        </p>
                        {loadingGeneration ? (
                          <div className="flex items-center justify-center py-4">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
                            <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">Loading...</span>
                          </div>
                        ) : generationError ? (
                          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                            <p className="text-sm text-red-600 dark:text-red-400">
                              Error: {generationError}
                            </p>
                          </div>
                        ) : generationData ? (
                          <div 
                            className={`bg-gray-100 dark:bg-gray-700 rounded-lg p-4 space-y-2 transition-all duration-200 cursor-pointer ${
                              isGenerationIdHovered 
                                ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                                : 'hover:ring-2 hover:ring-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                            }`}
                            onMouseEnter={() => {
                              onGenerationHover?.(generationId);
                              setIsGenerationIdHovered(true);
                            }}
                            onMouseLeave={() => {
                              onGenerationHover?.(undefined);
                              setIsGenerationIdHovered(false);
                            }}
                            onClick={() => onGenerationClick?.(generationId)}
                            title="Click to scroll to message"
                          >
                            <div className="flex justify-between">
                              <span className="text-gray-600 dark:text-gray-400">Provider:</span>
                              <span className="font-medium text-gray-900 dark:text-white">
                                {generationData.provider_name ?? 'N/A'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600 dark:text-gray-400">Latency:</span>
                              <span className="font-medium text-gray-900 dark:text-white">
                                {generationData.latency ?? 'N/A'}ms
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600 dark:text-gray-400">Duration:</span>
                              <span className="font-medium text-gray-900 dark:text-white">
                                {generationData.generation_time ?? 'N/A'}ms
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600 dark:text-gray-400">Tokens In:</span>
                              <span className="font-medium text-gray-900 dark:text-white">
                                {generationData.native_tokens_prompt ?? 'N/A'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600 dark:text-gray-400">Tokens Out:</span>
                              <span className="font-medium text-gray-900 dark:text-white">
                                {generationData.native_tokens_completion ?? 'N/A'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600 dark:text-gray-400">Total Cost:</span>
                              <span className="font-medium text-gray-900 dark:text-white">
                                ${generationData.total_cost?.toFixed(6) ?? 'N/A'}
                              </span>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                )}

                {/* Capabilities Tab */}
                {activeTab === 'capabilities' && (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Supported Parameters</h3>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Temperature:</span>
                          <span className="font-medium text-gray-900 dark:text-white">
                            {model.supported_parameters.includes('temperature') ? 'Yes' : 'No'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Max Tokens:</span>
                          <span className="font-medium text-gray-900 dark:text-white">
                            {model.supported_parameters.includes('max_tokens') ? 'Yes' : 'No'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Top P:</span>
                          <span className="font-medium text-gray-900 dark:text-white">
                            {model.supported_parameters.includes('top_p') ? 'Yes' : 'No'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Top K:</span>
                          <span className="font-medium text-gray-900 dark:text-white">
                            {model.supported_parameters.includes('top_k') ? 'Yes' : 'No'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Function Calling:</span>
                          <span className="font-medium text-gray-900 dark:text-white">
                            {model.supported_parameters.includes('tools') ? 'Yes' : 'No'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Structured Output:</span>
                          <span className="font-medium text-gray-900 dark:text-white">
                            {model.supported_parameters.includes('structured_outputs') || 
                             model.supported_parameters.includes('response_format') ? 'Yes' : 'No'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Reasoning Mode:</span>
                          <span className="font-medium text-gray-900 dark:text-white">
                            {model.supported_parameters.includes('reasoning') ? 'Yes' : 'No'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
          
              {/* Footer */}
              <div className="border-t border-gray-200 dark:border-gray-700 p-4">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onClose}
                  className="w-full"
                >
                  Close
                </Button>
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
