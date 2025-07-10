"use client";

import { useEffect } from "react";
import { useLocalStorage } from "./useLocalStorage";
import { useModelData } from "./useModelData";
import { ModelInfo } from "../lib/types/openrouter";

// Type guard to check if models are enhanced
const isEnhancedModels = (models: ModelInfo[] | string[]): models is ModelInfo[] => {
  return models.length > 0 && typeof models[0] === 'object' && 'name' in models[0];
};

export function useModelSelection() {
  const [selectedModel, setSelectedModel] = useLocalStorage<string>("selectedModel", "");
  
  // Use the new model data hook for caching and background refresh
  const {
    models: availableModels,
    loading: isLoading,
    error,
    isEnhanced,
    refresh: refreshModels,
    lastUpdated,
  } = useModelData();

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

  return {
    availableModels,
    selectedModel,
    setSelectedModel,
    isLoading,
    error,
    isEnhanced,
    refreshModels,
    lastUpdated, // Expose last updated timestamp
  };
}
