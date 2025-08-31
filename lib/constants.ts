// lib/constants.ts

/**
 * Storage keys for localStorage persistence
 */
export const STORAGE_KEYS = {
  CHAT: 'openrouter-chat-storage',
  // Cache of fetched model list (version/timestamp/models/modelConfigs)
  MODELS: 'openrouter-models-cache',
  // NEW: Persisted UI slice for model store (selectedModel/flags)
  MODELS_PERSIST: 'openrouter-models-persist',
  UI_PREFERENCES: 'openrouter-ui-preferences',
  SETTINGS: 'openrouter-settings-storage',
  GENERATION: 'openrouter-generation-cache',
} as const;

/**
 * Cache configuration constants
 */
export const CACHE_CONFIG = {
  MODEL_TTL_HOURS: 24,
  BACKGROUND_REFRESH_INTERVAL: 60 * 60 * 1000, // 1 hour in milliseconds
  CACHE_VERSION: 1,
  MAX_CONVERSATIONS: 100, // Limit stored conversations
  MAX_MESSAGES_PER_CONVERSATION: 1000,
} as const;

/**
 * Store configuration constants
 */
export const STORE_CONFIG = {
  DEVTOOLS_ENABLED: process.env.NODE_ENV === 'development',
  PERSISTENCE_ENABLED: typeof window !== 'undefined',
  BROADCAST_CHANNEL_ENABLED: typeof BroadcastChannel !== 'undefined',
} as const;

/**
 * API configuration constants
 */
export const API_CONFIG = {
  CHAT_ENDPOINT: '/api/chat',
  MODELS_ENDPOINT: '/api/models',
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000, // milliseconds
} as const;
