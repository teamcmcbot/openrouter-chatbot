"use client";

import { useState, useEffect, useCallback } from "react";
import { useLocalStorage } from "./useLocalStorage";
import { ModelInfo } from "../lib/types/openrouter";

// Type guard to check if models are enhanced
const isEnhancedModels = (models: ModelInfo[] | string[]): models is ModelInfo[] => {
  return models.length > 0 && typeof models[0] === 'object' && 'name' in models[0];
};

export function useModelSelection() {
  const [availableModels, setAvailableModels] = useState<ModelInfo[] | string[]>([]);
  const [selectedModel, setSelectedModel] = useLocalStorage<string>("selectedModel", "");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isEnhanced, setIsEnhanced] = useState(false);

  const fetchModels = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch("/api/models?enhanced=true");
      if (response.ok) {
        const data = await response.json();
        const models = data.models;
        
        setAvailableModels(models);
        setIsEnhanced(isEnhancedModels(models));
        
        // Log enhanced mode status for debugging
        console.log('Models fetched:', {
          count: models.length,
          isEnhanced: isEnhancedModels(models),
          enhanced: response.headers.get('X-Enhanced-Mode')
        });
      } else {
        throw new Error(`Failed to fetch models: ${response.status}`);
      }
    } catch (fetchError) {
      console.warn("Failed to fetch available models:", fetchError);
      setError(fetchError instanceof Error ? fetchError : new Error('Unknown error'));
      
      // Fallback to default model list if API fails
      const fallbackModels = ["gpt-3.5-turbo", "gpt-4", "claude-3-sonnet"];
      setAvailableModels(fallbackModels);
      setIsEnhanced(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]); // Include fetchModels dependency

  // Separate effect to set default model when models are loaded
  useEffect(() => {
    if (!selectedModel && availableModels.length > 0) {
      // Get the first model ID, regardless of format
      const firstModelId = isEnhancedModels(availableModels) 
        ? availableModels[0].id 
        : availableModels[0];
      setSelectedModel(firstModelId);
    }
  }, [availableModels, selectedModel, setSelectedModel]);

  // Validate selected model is still available
  useEffect(() => {
    if (selectedModel && availableModels.length > 0) {
      const modelExists = isEnhancedModels(availableModels)
        ? availableModels.some(model => model.id === selectedModel)
        : availableModels.includes(selectedModel);
      
      if (!modelExists) {
        // Selected model no longer available, reset to first available
        const firstModelId = isEnhancedModels(availableModels) 
          ? availableModels[0].id 
          : availableModels[0];
        setSelectedModel(firstModelId);
      }
    }
  }, [availableModels, selectedModel, setSelectedModel]);

  const refreshModels = useCallback(() => {
    fetchModels();
  }, [fetchModels]);

  return {
    availableModels,
    selectedModel,
    setSelectedModel,
    isLoading,
    error,
    isEnhanced,
    refreshModels,
  };
}
