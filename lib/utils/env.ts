// lib/utils/env.ts

export function getEnvVar(name: string, defaultValue?: string): string {
  const value = process.env[name];

  if (value !== undefined) {
    return value;
  }

  if (defaultValue !== undefined) {
    return defaultValue;
  }

  throw new Error(`Environment variable ${name} is not set and no default value was provided.`);
}

// Feature flag utility functions (generic)
export function isFeatureEnabled(featureName: string, defaultValue: boolean = false): boolean {
  const envValue = process.env[featureName];
  if (envValue === undefined) return defaultValue;
  return envValue.toLowerCase() === 'true' || envValue === '1';
}

export function getEnvNumber(name: string, defaultValue?: number): number {
  const value = process.env[name];
  
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Environment variable ${name} is not set and no default value was provided.`);
  }
  
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a valid number, got: ${value}`);
  }
  
  return parsed;
}

export function getModelsCacheTTL(): number {
  return getEnvNumber('MODELS_CACHE_TTL_MINUTES', 30);
}

export function getModelsRefreshInterval(): number {
  return getEnvNumber('MODELS_BACKGROUND_REFRESH_INTERVAL', 60);
}

export function getModelsCacheMaxSize(): number {
  return getEnvNumber('MODELS_CACHE_MAX_SIZE', 1000);
}

export function validateEnvVars() {
  const requiredEnvVars = [
    'OPENROUTER_API_KEY',
    'OPENROUTER_API_MODEL',
    'OPENROUTER_BASE_URL',
    'OPENROUTER_MAX_TOKENS',
  ];

  // Optional environment variables (will use defaults if not provided)
  const optionalEnvVars = [
    'OPENROUTER_MODELS_LIST', // Comma-separated list of available models
    'OPENROUTER_MODELS_API_URL', // OpenRouter models API endpoint
    'MODELS_CACHE_TTL_MINUTES', // Cache TTL in minutes
    'NEXT_PUBLIC_SITE_URL', // Site URL for OpenRouter API headers
    'MODELS_BACKGROUND_REFRESH_INTERVAL', // Background refresh interval
    'MODELS_CACHE_MAX_SIZE', // Maximum number of models to cache
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }

  // Log info about optional variables
  optionalEnvVars.forEach(varName => {
    if (!process.env[varName]) {
      console.info(`Optional environment variable ${varName} not set, using defaults`);
    }
  });

  console.info(`Models cache TTL: ${getModelsCacheTTL()} minutes`);
}
