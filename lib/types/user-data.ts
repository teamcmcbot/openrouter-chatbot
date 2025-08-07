// lib/types/user-data.ts

/**
 * Today's usage statistics for the current date
 */
export interface TodayUsage {
  /** Number of messages sent by the user today */
  messages_sent: number;
  /** Number of messages received from AI today */
  messages_received: number;
  /** Total tokens used today (input + output) */
  total_tokens: number;
  /** Input tokens used today */
  input_tokens: number;
  /** Output tokens used today */
  output_tokens: number;
  /** Models used today with usage counts */
  models_used: Record<string, number>;
  /** Number of chat sessions created today */
  sessions_created: number;
  /** Active minutes spent in chat today */
  active_minutes: number;
}

/**
 * All-time cumulative usage statistics
 */
export interface AllTimeUsage {
  /** Total messages sent (cumulative, includes deleted) */
  total_messages: number;
  /** Total tokens used (cumulative, includes deleted) */
  total_tokens: number;
  /** Total sessions created (cumulative) */
  sessions_created: number;
  /** Timestamp when stats were last reset */
  last_reset: string;
}

/**
 * User profile information
 */
export interface UserProfileData {
  /** User's email address */
  email: string;
  /** User's full name */
  full_name: string;
  /** URL to user's avatar image */
  avatar_url: string;
  /** User's subscription tier */
  subscription_tier: "free" | "pro" | "enterprise";
  /** Available credits for paid models */
  credits: number;
}

/**
 * User preferences for UI, session, and model settings
 */
export interface UserPreferences {
  /** UI preferences like theme, sidebar settings */
  ui: {
    theme?: string;
    auto_save?: boolean;
    sidebar_width?: number;
    show_token_count?: boolean;
    code_highlighting?: boolean;
    [key: string]: string | number | boolean | null | undefined;
  };
  /** Session preferences for chat behavior */
  session: {
    auto_title?: boolean;
    max_history?: number;
    save_anonymous?: boolean;
    [key: string]: string | number | boolean | null | undefined;
  };
  /** Model preferences for AI responses */
  model: {
    /** Default model to use for new chats (null for no default) */
    default_model: string | null;
    /** Temperature setting for model responses (0-2) */
    temperature: number;
    /** System prompt for model behavior */
    system_prompt: string;
  };
}

/**
 * Available model information
 */
export interface AvailableModel {
  /** Unique model identifier */
  model_id: string;
  /** Human-readable model name */
  model_name: string;
  /** Description of model capabilities */
  model_description: string;
  /** Tags categorizing the model */
  model_tags: string[];
  /** Daily usage limit for this model (null = unlimited) */
  daily_limit: number | null;
  /** Monthly usage limit for this model (null = unlimited) */
  monthly_limit: number | null;
}

/**
 * Timestamp information for user account
 */
export interface UserTimestamps {
  /** When the user account was created */
  created_at: string;
  /** When the user profile was last updated */
  updated_at: string;
  /** When the user was last active */
  last_active: string;
}

/**
 * Complete user data response from the API
 */
export interface UserDataResponse {
  /** Today's usage statistics */
  today: TodayUsage;
  /** All-time cumulative statistics */
  allTime: AllTimeUsage;
  /** User profile information */
  profile: UserProfileData;
  /** User preferences */
  preferences: UserPreferences;
  /** Available models for this user */
  availableModels: AvailableModel[];
  /** Account timestamps */
  timestamps: UserTimestamps;
}

/**
 * Partial preferences update for PUT requests
 * All fields are optional to allow partial updates
 */
export interface UserPreferencesUpdate {
  /** UI preferences to update */
  ui?: Partial<UserPreferences['ui']>;
  /** Session preferences to update */
  session?: Partial<UserPreferences['session']>;
  /** Model preferences to update */
  model?: Partial<UserPreferences['model']>;
}

/**
 * Error response structure for API errors
 */
export interface UserDataError {
  /** Error type identifier */
  error: string;
  /** Human-readable error message */
  message: string;
}
