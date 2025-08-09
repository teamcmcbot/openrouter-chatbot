// lib/services/modelSyncService.ts

import { fetchOpenRouterModels } from '../utils/openrouter';
import { OpenRouterModel } from '../types/openrouter';
import { createClient } from '../supabase/server';
import { logger } from '../utils/logger';
import { ApiErrorResponse, ErrorCode } from '../utils/errors';

export interface SyncResult {
  success: boolean;
  syncLogId: string;
  totalProcessed: number;
  modelsAdded: number;
  modelsUpdated: number;
  modelsMarkedInactive: number;
  durationMs: number;
  errors?: string[];
}

export interface SyncStatus {
  lastSyncAt: Date | null;
  lastSyncStatus: 'completed' | 'failed' | 'running' | null;
  totalModels: number;
  lastSyncDuration: number | null;
  errorMessage?: string;
}

export class ModelSyncService {
  /**
   * Create a Supabase client for the current request context
   */
  private async getSupabaseClient() {
    return await createClient();
  }

  /**
   * Main sync method that orchestrates the entire model synchronization process
   */
  async syncModels(triggeredByUserId?: string): Promise<SyncResult> {
    const startTime = Date.now();
    
    try {
      logger.info('Starting model sync process');
      
      // Step 1: Fetch models from OpenRouter API
      const models = await this.fetchAndValidateModels();
      
      // Step 2: Call database sync function
  const result = await this.syncModelsToDatabase(models, triggeredByUserId);
      
      const durationMs = Date.now() - startTime;
      
      logger.info(`Model sync completed successfully in ${durationMs}ms`, {
        totalProcessed: result.total_processed,
        modelsAdded: result.models_added,
        modelsUpdated: result.models_updated,
        modelsMarkedInactive: result.models_marked_inactive
      });

      return {
        success: true,
        syncLogId: result.sync_log_id,
        totalProcessed: result.total_processed,
        modelsAdded: result.models_added,
        modelsUpdated: result.models_updated,
        modelsMarkedInactive: result.models_marked_inactive,
        durationMs: result.duration_ms
      };

    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error('Model sync failed:', {
        error: errorMessage,
        durationMs
      });

      return {
        success: false,
        syncLogId: 'unknown',
        totalProcessed: 0,
        modelsAdded: 0,
        modelsUpdated: 0,
        modelsMarkedInactive: 0,
        durationMs,
        errors: [errorMessage]
      };
    }
  }

  /**
   * Fetch models from OpenRouter API and validate the data
   */
  private async fetchAndValidateModels(): Promise<OpenRouterModel[]> {
    try {
      logger.info('Fetching models from OpenRouter API');
      const models = await fetchOpenRouterModels();
      
      // Validate the fetched data
      const validationResult = await this.validateSyncData(models);
      if (!validationResult) {
        throw new ApiErrorResponse(
          'Model data validation failed',
          ErrorCode.BAD_REQUEST,
          'Invalid model data structure from OpenRouter API'
        );
      }

      logger.info(`Successfully fetched and validated ${models.length} models`);
      return models;

    } catch (error) {
      logger.error('Failed to fetch models from OpenRouter:', error);
      throw error;
    }
  }

  /**
   * Sync models to database using the database function
   */
  private async syncModelsToDatabase(models: OpenRouterModel[], triggeredByUserId?: string): Promise<{
    success: boolean;
    sync_log_id: string;
    total_processed: number;
    models_added: number;
    models_updated: number;
    models_marked_inactive: number;
    duration_ms: number;
    error?: string;
  }> {
    try {
      logger.info(`Syncing ${models.length} models to database`);
      
      const supabase = await this.getSupabaseClient();
      
      // Call the database function with the models data
      const { data, error } = await supabase.rpc('sync_openrouter_models', {
        models_data: models,
        p_added_by_user_id: triggeredByUserId ?? null,
      });

      if (error) {
        logger.error('Database sync function failed:', error);
        throw new ApiErrorResponse(
          'Database sync failed',
          ErrorCode.BAD_GATEWAY,
          error.message
        );
      }

      if (!data || !data.success) {
        const errorMsg = data?.error || 'Unknown database error';
        logger.error('Database sync returned failure:', errorMsg);
        throw new ApiErrorResponse(
          'Database sync failed',
          ErrorCode.BAD_GATEWAY,
          errorMsg
        );
      }

      return data;

    } catch (error) {
      logger.error('Error syncing models to database:', error);
      throw error;
    }
  }

  /**
   * Validate the structure and content of model data from OpenRouter
   */
  async validateSyncData(models: OpenRouterModel[]): Promise<boolean> {
    try {
      if (!Array.isArray(models)) {
        logger.error('Models data is not an array');
        return false;
      }

      if (models.length === 0) {
        logger.warn('No models received from OpenRouter API');
        return false;
      }

      const validationErrors: string[] = [];

      // Validate each model has required fields
      for (let i = 0; i < models.length; i++) {
        const model = models[i];
        const modelIndex = `Model ${i + 1} (${model?.id || 'unknown'})`;

        // Required fields validation
        if (!model.id || typeof model.id !== 'string') {
          validationErrors.push(`${modelIndex}: Missing or invalid id`);
        }

        if (!model.name || typeof model.name !== 'string') {
          validationErrors.push(`${modelIndex}: Missing or invalid name`);
        }

        if (!model.pricing || typeof model.pricing !== 'object') {
          validationErrors.push(`${modelIndex}: Missing or invalid pricing`);
        } else {
          // Validate pricing fields are strings (as expected by database)
          const pricingFields: (keyof typeof model.pricing)[] = ['prompt', 'completion'];
          for (const field of pricingFields) {
            if (model.pricing[field] !== undefined && typeof model.pricing[field] !== 'string') {
              validationErrors.push(`${modelIndex}: Invalid pricing.${field} - must be string`);
            }
          }
        }

        if (!model.architecture || typeof model.architecture !== 'object') {
          validationErrors.push(`${modelIndex}: Missing or invalid architecture`);
        }

        if (typeof model.context_length !== 'number') {
          validationErrors.push(`${modelIndex}: Missing or invalid context_length`);
        }

        // Stop validation if we have too many errors (first 10)
        if (validationErrors.length >= 10) {
          validationErrors.push('... and more validation errors');
          break;
        }
      }

      if (validationErrors.length > 0) {
        logger.error('Model data validation failed:', validationErrors);
        return false;
      }

      logger.info(`Successfully validated ${models.length} models`);
      return true;

    } catch (error) {
      logger.error('Error during model data validation:', error);
      return false;
    }
  }

  /**
   * Get the status of the last sync operation
   */
  async getLastSyncStatus(): Promise<SyncStatus> {
    try {
      const supabase = await this.getSupabaseClient();
      
      const { data, error } = await supabase
        .from('model_sync_log')
        .select('*')
        .order('sync_started_at', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No sync logs found
          return {
            lastSyncAt: null,
            lastSyncStatus: null,
            totalModels: 0,
            lastSyncDuration: null
          };
        }
        
        logger.error('Error fetching last sync status:', error);
        throw new ApiErrorResponse(
          'Failed to fetch sync status',
          ErrorCode.BAD_GATEWAY,
          error.message
        );
      }

      return {
        lastSyncAt: data.sync_started_at ? new Date(data.sync_started_at) : null,
        lastSyncStatus: data.sync_status,
        totalModels: data.total_openrouter_models || 0,
        lastSyncDuration: data.duration_ms,
        errorMessage: data.error_message || undefined
      };

    } catch (error) {
      logger.error('Error getting last sync status:', error);
      throw error;
    }
  }

  /**
   * Check if a sync operation is currently running
   */
  async isSyncRunning(): Promise<boolean> {
    try {
      const supabase = await this.getSupabaseClient();
      
      const { data, error } = await supabase
        .from('model_sync_log')
        .select('id')
        .eq('sync_status', 'running')
        .limit(1);

      if (error) {
        logger.error('Error checking if sync is running:', error);
        return false;
      }

      return data && data.length > 0;

    } catch (error) {
      logger.error('Error checking sync status:', error);
      return false;
    }
  }

  /**
   * Get sync statistics for monitoring
   */
  async getSyncStatistics(days: number = 7): Promise<{
    totalSyncs: number;
    successfulSyncs: number;
    failedSyncs: number;
    averageDuration: number;
    lastSuccessfulSync: Date | null;
  }> {
    try {
      const supabase = await this.getSupabaseClient();
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const { data, error } = await supabase
        .from('model_sync_log')
        .select('sync_status, duration_ms, sync_completed_at')
        .gte('sync_started_at', cutoffDate.toISOString())
        .order('sync_started_at', { ascending: false });

      if (error) {
        logger.error('Error fetching sync statistics:', error);
        throw new ApiErrorResponse(
          'Failed to fetch sync statistics',
          ErrorCode.BAD_GATEWAY,
          error.message
        );
      }

      const totalSyncs = data.length;
      const successfulSyncs = data.filter(s => s.sync_status === 'completed').length;
      const failedSyncs = data.filter(s => s.sync_status === 'failed').length;
      
      const completedSyncs = data.filter(s => s.duration_ms !== null);
      const averageDuration = completedSyncs.length > 0
        ? completedSyncs.reduce((sum, s) => sum + (s.duration_ms || 0), 0) / completedSyncs.length
        : 0;

      const lastSuccessful = data.find(s => s.sync_status === 'completed' && s.sync_completed_at);
      const lastSuccessfulSync = lastSuccessful 
        ? new Date(lastSuccessful.sync_completed_at) 
        : null;

      return {
        totalSyncs,
        successfulSyncs,
        failedSyncs,
        averageDuration: Math.round(averageDuration),
        lastSuccessfulSync
      };

    } catch (error) {
      logger.error('Error getting sync statistics:', error);
      throw error;
    }
  }
}

// Export a singleton instance
export const modelSyncService = new ModelSyncService();
