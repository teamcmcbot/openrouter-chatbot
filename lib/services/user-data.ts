// lib/services/user-data.ts

import { UserDataResponse, UserPreferencesUpdate, UserDataError } from '../types/user-data';

/**
 * Service for fetching and updating user data including analytics and preferences
 */

/**
 * Fetches comprehensive user data including analytics, profile, and preferences
 * Requires authentication - the user must be signed in
 * 
 * @returns Promise<UserDataResponse> Complete user data
 * @throws Error if request fails or user is not authenticated
 */
export async function fetchUserData(): Promise<UserDataResponse> {
  const response = await fetch('/api/user/data', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include', // Include cookies for session-based auth
  });

  if (!response.ok) {
    let errorMessage = 'Failed to fetch user data';
    try {
      const errorData: UserDataError = await response.json();
      errorMessage = errorData.message || errorMessage;
    } catch {
      // If we can't parse error response, use default message
    }
    
    throw new Error(errorMessage);
  }

  return response.json();
}

/**
 * Updates user preferences (UI, session, model settings)
 * Requires authentication - the user must be signed in
 * 
 * @param preferences - Partial preferences object to update
 * @returns Promise<UserDataResponse> Updated user data
 * @throws Error if request fails, validation fails, or user is not authenticated
 */
export async function updateUserPreferences(
  preferences: UserPreferencesUpdate
): Promise<UserDataResponse> {
  const response = await fetch('/api/user/data', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include', // Include cookies for session-based auth
    body: JSON.stringify(preferences),
  });

  if (!response.ok) {
    let errorMessage = 'Failed to update preferences';
    try {
      const errorData: UserDataError = await response.json();
      errorMessage = errorData.message || errorMessage;
    } catch {
      // If we can't parse error response, use default message
    }
    
    throw new Error(errorMessage);
  }

  return response.json();
}

/**
 * Validates preference update data before sending to server
 * 
 * @param preferences - Preferences to validate
 * @returns true if valid, throws Error with specific message if invalid
 * @throws Error with validation message if data is invalid
 */
export function validatePreferencesUpdate(preferences: UserPreferencesUpdate): boolean {
  // Validate temperature if provided
  if (preferences.model?.temperature !== undefined) {
    const temp = preferences.model.temperature;
    if (typeof temp !== 'number' || temp < 0 || temp > 2) {
      throw new Error('Temperature must be a number between 0 and 2');
    }
  }

  // Validate default_model if provided
  if (preferences.model?.default_model !== undefined) {
    const model = preferences.model.default_model;
    if (typeof model !== 'string' || model.trim().length === 0) {
      throw new Error('Default model must be a non-empty string');
    }
  }

  // Validate UI preferences types
  if (preferences.ui) {
    for (const [key, value] of Object.entries(preferences.ui)) {
      if (value !== null && value !== undefined) {
        const valueType = typeof value;
        if (!['string', 'number', 'boolean'].includes(valueType)) {
          throw new Error(`UI preference '${key}' must be a string, number, or boolean`);
        }
      }
    }
  }

  // Validate session preferences types
  if (preferences.session) {
    for (const [key, value] of Object.entries(preferences.session)) {
      if (value !== null && value !== undefined) {
        const valueType = typeof value;
        if (!['string', 'number', 'boolean'].includes(valueType)) {
          throw new Error(`Session preference '${key}' must be a string, number, or boolean`);
        }
      }
    }
  }

  return true;
}
