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
}
