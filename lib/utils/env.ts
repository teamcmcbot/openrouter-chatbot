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

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }
}
