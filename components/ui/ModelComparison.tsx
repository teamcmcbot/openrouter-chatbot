"use client";

import { useState } from "react";
import { ModelInfo } from "../../lib/types/openrouter";
import Button from "./Button";

interface ModelComparisonProps {
  models: ModelInfo[];
  isOpen: boolean;
  onClose: () => void;
  onSelectModel?: (modelId: string) => void;
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
  if (num < 0.000001) return `$${(num * 1000000).toFixed(2)}/1M`;
  if (num < 0.001) return `$${(num * 1000).toFixed(2)}/1K`;
  return `$${num.toFixed(4)}`;
};

export function ModelComparison({ models, isOpen, onClose, onSelectModel }: ModelComparisonProps) {
  const [searchTerm, setSearchTerm] = useState("");

  if (!isOpen) {
    return null;
  }

  // Filter models based on search
  const filteredModels = models.filter(model =>
    model.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    model.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    model.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelectModel = (modelId: string) => {
    onSelectModel?.(modelId);
    onClose();
  };

  return (
    <>
      {/* Overlay */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      
      {/* Modal */}
      <div 
        className="fixed inset-4 bg-white dark:bg-gray-900 shadow-xl z-50 rounded-lg overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="comparison-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 id="comparison-title" className="text-xl font-semibold text-gray-900 dark:text-white">
              Model Comparison
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Compare models side by side to find the best fit for your needs
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Close model comparison"
          >
            ✕
          </Button>
        </div>

        {/* Search */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="relative">
            <input
              type="text"
              placeholder="Search models to compare..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <svg className="absolute right-3 top-2.5 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        {/* Comparison Table */}
        <div className="flex-1 overflow-auto p-6">
          {filteredModels.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400 text-lg">
                No models found matching your search
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider sticky left-0 bg-gray-50 dark:bg-gray-800 z-10">
                      Model
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Context
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Input Price
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Output Price
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Modalities
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Capabilities
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredModels.map((model, index) => (
                    <tr key={model.id} className={index % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-800'}>
                      {/* Model Info */}
                      <td className="px-4 py-4 sticky left-0 bg-inherit z-10">
                        <div className="min-w-0 max-w-xs">
                          <div className="flex items-center space-x-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                {model.name}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate">
                                {model.id}
                              </p>
                              <div className="flex gap-1 mt-1">
                                {/* Badges */}
                                {parseFloat(model.pricing.prompt) === 0 && 
                                 parseFloat(model.pricing.completion) === 0 && (
                                  <span className="text-[9px] bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 px-1 py-0.5 rounded">
                                    FREE
                                  </span>
                                )}
                                {model.input_modalities.length > 1 && (
                                  <span className="text-[9px] bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 px-1 py-0.5 rounded">
                                    MM
                                  </span>
                                )}
                                {model.supported_parameters.includes('reasoning') && (
                                  <span className="text-[9px] bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300 px-1 py-0.5 rounded">
                                    R1
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Context Length */}
                      <td className="px-4 py-4 text-center">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {formatNumber(model.context_length)}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">tokens</div>
                      </td>

                      {/* Input Price */}
                      <td className="px-4 py-4 text-center">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {formatPrice(model.pricing.prompt)}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">per token</div>
                      </td>

                      {/* Output Price */}
                      <td className="px-4 py-4 text-center">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {formatPrice(model.pricing.completion)}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">per token</div>
                      </td>

                      {/* Modalities */}
                      <td className="px-4 py-4 text-center">
                        <div className="flex flex-col items-center space-y-1">
                          <div className="flex flex-wrap gap-1 justify-center">
                            {model.input_modalities.slice(0, 2).map((modality) => (
                              <span
                                key={modality}
                                className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                              >
                                {modality}
                              </span>
                            ))}
                          </div>
                          {model.input_modalities.length > 2 && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              +{model.input_modalities.length - 2} more
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Capabilities */}
                      <td className="px-4 py-4 text-center">
                        <div className="flex flex-col items-center space-y-1">
                          <div className="grid grid-cols-2 gap-1 text-xs">
                            <div className={`flex items-center justify-center ${
                              model.supported_parameters.includes('tools') 
                                ? 'text-green-600 dark:text-green-400' 
                                : 'text-gray-400'
                            }`}>
                              {model.supported_parameters.includes('tools') ? '✓' : '✗'} Tools
                            </div>
                            <div className={`flex items-center justify-center ${
                              model.supported_parameters.includes('response_format') || 
                              model.supported_parameters.includes('structured_outputs')
                                ? 'text-green-600 dark:text-green-400' 
                                : 'text-gray-400'
                            }`}>
                              {model.supported_parameters.includes('response_format') || 
                               model.supported_parameters.includes('structured_outputs') ? '✓' : '✗'} JSON
                            </div>
                            <div className={`flex items-center justify-center ${
                              model.supported_parameters.includes('stream')
                                ? 'text-green-600 dark:text-green-400' 
                                : 'text-gray-400'
                            }`}>
                              {model.supported_parameters.includes('stream') ? '✓' : '✗'} Stream
                            </div>
                            <div className={`flex items-center justify-center ${
                              model.supported_parameters.includes('reasoning')
                                ? 'text-green-600 dark:text-green-400' 
                                : 'text-gray-400'
                            }`}>
                              {model.supported_parameters.includes('reasoning') ? '✓' : '✗'} Reason
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-4 text-center">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleSelectModel(model.id)}
                          className="text-xs"
                        >
                          Select
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-6 flex justify-between items-center">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Showing {filteredModels.length} of {models.length} models
          </div>
          <Button
            variant="secondary"
            onClick={onClose}
          >
            Close
          </Button>
        </div>
      </div>
    </>
  );
}
