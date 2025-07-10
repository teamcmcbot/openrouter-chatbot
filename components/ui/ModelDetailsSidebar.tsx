"use client";

import { useState } from "react";
import { ModelInfo } from "../../lib/types/openrouter";
import Button from "./Button";

interface ModelDetailsSidebarProps {
  model: ModelInfo | null;
  isOpen: boolean;
  onClose: () => void;
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

// Format pricing for display
const formatPrice = (price: string): string => {
  const num = parseFloat(price);
  if (num === 0) return "Free";
  if (num < 0.000001) return `$${(num * 1000000).toFixed(2)}/1M tokens`;
  if (num < 0.001) return `$${(num * 1000).toFixed(2)}/1K tokens`;
  return `$${num.toFixed(4)}/token`;
};

// Format date for display
const formatDate = (timestamp: number): string => {
  return new Date(timestamp * 1000).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

export function ModelDetailsSidebar({ model, isOpen, onClose }: ModelDetailsSidebarProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'pricing' | 'capabilities'>('overview');

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      
      <aside 
        className={`h-full bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 transition-all duration-300 ease-in-out overflow-hidden
          ${isOpen ? 'w-96' : 'w-0'}
          md:relative md:block md:w-full
          ${isOpen ? 'fixed inset-y-0 right-0 z-50 md:relative md:z-auto' : 'hidden md:block'}
        `}
        aria-labelledby="sidebar-title"
      >
        <div className="h-full flex flex-col">
          {!model ? (
            // Placeholder when no model is selected
            <div className="flex flex-col items-center justify-center h-full p-6 text-center">
              <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                Model Details
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
                Click the info icon next to any model in the dropdown to view detailed information here.
              </p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                <h2 id="sidebar-title" className="text-lg font-semibold text-gray-900 dark:text-white truncate pr-2">
                  {model.name}
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  className="flex-shrink-0"
                  aria-label="Close model details"
                >
                  ✕
                </Button>
              </div>

              {/* Tab Navigation */}
              <div className="flex border-b border-gray-200 dark:border-gray-700">
                {(['overview', 'pricing', 'capabilities'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 py-3 px-4 text-sm font-medium capitalize transition-colors ${
                      activeTab === tab
                        ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                        : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Content Area */}
              <div className="flex-1 overflow-y-auto p-4">
                {/* Overview Tab */}
                {activeTab === 'overview' && (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Description</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {model.description || 'No description available.'}
                      </p>
                    </div>
                    
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Basic Information</h3>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Model ID:</span>
                          <span className="font-mono text-sm text-gray-900 dark:text-white">{model.id}</span>
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
                      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Token Pricing</h3>
                      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Input:</span>
                          <span className="font-medium text-gray-900 dark:text-white">
                            {formatPrice(model.pricing.prompt)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Output:</span>
                          <span className="font-medium text-gray-900 dark:text-white">
                            {formatPrice(model.pricing.completion)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Cost Estimate</h3>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        <p>1,000 tokens input + 1,000 tokens output:</p>
                        <p className="font-medium text-gray-900 dark:text-white mt-1">
                          ${((parseFloat(model.pricing.prompt) + parseFloat(model.pricing.completion)) * 1000).toFixed(4)}
                        </p>
                      </div>
                    </div>
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
