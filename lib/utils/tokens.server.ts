/**
 * Server-only token utilities that rely on DB-backed model access
 */
import { calculateTokenStrategy, TokenStrategy } from './tokens';
import { getServerModelConfig } from '../server/models';

export type SubscriptionTier = 'anonymous' | 'free' | 'pro' | 'enterprise';

export async function getModelTokenLimits(modelId?: string, opts?: { tier?: SubscriptionTier }): Promise<TokenStrategy> {
  console.log(`[Server Token Limits] Looking up limits for model: ${modelId || 'default'}`);
  if (!modelId) {
    return calculateTokenStrategy(8000);
  }
  const tier: SubscriptionTier = opts?.tier || 'anonymous';
  try {
    const dbConfig = await getServerModelConfig({ modelId, tier });
    if (dbConfig) {
      console.log(`[Server Token Limits] DB model ${modelId} context length: ${dbConfig.context_length} (tier=${tier})`);
      return calculateTokenStrategy(dbConfig.context_length);
    }
    console.log(`[Server Token Limits] Model '${modelId}' not accessible for tier=${tier}, using conservative default`);
    return calculateTokenStrategy(8000);
  } catch (error) {
    console.error(`[Server Token Limits] Error resolving model ${modelId} from DB:`, error);
    return calculateTokenStrategy(8000);
  }
}

export async function getMaxOutputTokens(modelId?: string, opts?: { tier?: SubscriptionTier }): Promise<number> {
  const strategy = await getModelTokenLimits(modelId, opts);
  return strategy.maxOutputTokens;
}
