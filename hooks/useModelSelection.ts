"use client";

import { useState, useEffect } from "react";
import { useLocalStorage } from "./useLocalStorage";

export function useModelSelection() {
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useLocalStorage<string>("selectedModel", "");

  useEffect(() => {
    // Fetch available models from environment variable
    const fetchModels = async () => {
      try {
        const response = await fetch("/api/models");
        if (response.ok) {
          const { models } = await response.json();
          setAvailableModels(models);
        }
      } catch (error) {
        console.warn("Failed to fetch available models:", error);
        // Fallback to default model list if API fails
        const fallbackModels = ["gpt-3.5-turbo", "gpt-4", "claude-3-sonnet"];
        setAvailableModels(fallbackModels);
      }
    };

    fetchModels();
  }, []); // Only run once on mount

  // Separate effect to set default model when models are loaded
  useEffect(() => {
    if (!selectedModel && availableModels.length > 0) {
      setSelectedModel(availableModels[0]);
    }
  }, [availableModels, selectedModel, setSelectedModel]);

  return {
    availableModels,
    selectedModel,
    setSelectedModel,
  };
}
