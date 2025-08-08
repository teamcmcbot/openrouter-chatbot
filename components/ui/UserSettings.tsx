"use client";

import { useState, useEffect } from "react";
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import Button from "./Button";
import { useAuth } from "../../stores/useAuthStore";
import { useUserData } from "../../hooks/useUserData";
import { validateSystemPrompt, truncateAtWordBoundary, SYSTEM_PROMPT_LIMITS } from "../../lib/utils/validation/systemPrompt";
import toast from 'react-hot-toast';

interface UserSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function UserSettings({ isOpen, onClose }: Readonly<UserSettingsProps>) {
  const { user, isLoading: authLoading } = useAuth();
  const { data: userData, loading, refreshing, error, updatePreferences, forceRefresh } = useUserData({ enabled: isOpen });
  
  // State for editing preferences
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false); // Separate saving state for better UX
  const [editedPreferences, setEditedPreferences] = useState({
    theme: '',
    defaultModel: '' as string | null, // Allow null for "None" selection
    temperature: 0.7,
    systemPrompt: '', // Add system prompt to edited state
  });
  const [isRefreshAnimating, setIsRefreshAnimating] = useState(false);
  
  // System prompt specific state
  const [systemPromptError, setSystemPromptError] = useState<string | null>(null);
  const [lastKnownGoodSystemPrompt, setLastKnownGoodSystemPrompt] = useState<string>('');

  // State synchronization: Update edited preferences when userData changes (after successful save)
  useEffect(() => {
    if (userData?.preferences && !isEditing) {
      const currentPrefs = {
        theme: userData.preferences.ui.theme || "dark",
        defaultModel: userData.preferences.model.default_model || null,
        temperature: userData.preferences.model.temperature || 0.7,
        systemPrompt: userData.preferences.model.system_prompt || "You are a helpful AI assistant.",
      };
      
      setEditedPreferences(currentPrefs);
      setLastKnownGoodSystemPrompt(currentPrefs.systemPrompt);
    }
  }, [userData?.preferences, isEditing]);

  // Enhanced refresh handler with animation timing
  const handleRefresh = async () => {
    if (refreshing || isRefreshAnimating) return;
    
    const SPIN_DURATION_MS = 1000; // One full rotation takes 1 second in Tailwind's animate-spin
    const startTime = Date.now();
    
    setIsRefreshAnimating(true);
    
    try {
      // Start the API call
      await forceRefresh();
      
      // Calculate how long the API call took
      const apiDuration = Date.now() - startTime;
      
      // Calculate how many complete rotations have occurred
      const completeRotations = Math.floor(apiDuration / SPIN_DURATION_MS);
      
      // Calculate the next complete rotation point
      const nextCompleteRotation = (completeRotations + 1) * SPIN_DURATION_MS;
      
      // If we haven't reached the next complete rotation, wait for it
      if (apiDuration < nextCompleteRotation) {
        const timeToNextRotation = nextCompleteRotation - apiDuration;
        await new Promise(resolve => setTimeout(resolve, timeToNextRotation));
      }
    } catch {
      // Even on error, ensure we stop at a complete rotation
      const apiDuration = Date.now() - startTime;
      const completeRotations = Math.floor(apiDuration / SPIN_DURATION_MS);
      const nextCompleteRotation = (completeRotations + 1) * SPIN_DURATION_MS;
      
      if (apiDuration < nextCompleteRotation) {
        const timeToNextRotation = nextCompleteRotation - apiDuration;
        await new Promise(resolve => setTimeout(resolve, timeToNextRotation));
      }
    } finally {
      setIsRefreshAnimating(false);
    }
  };

  if (!isOpen) return null;

  // Show loading state if auth is still loading or initial data is loading (not refreshing)
  if (authLoading || (loading && !userData)) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />
        <div className="relative bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg shadow-xl w-full max-w-lg p-6">
          <h2 className="text-xl font-semibold mb-4">User Settings</h2>
          <div className="flex items-center justify-center py-8">
            <div className="text-sm text-gray-500">Loading...</div>
          </div>
        </div>
      </div>
    );
  }

  // Show error state with retry option
  if (error && !userData) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />
        <div className="relative bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg shadow-xl w-full max-w-lg p-6">
          <h2 className="text-xl font-semibold mb-4">User Settings</h2>
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <div className="text-sm text-red-500">{error}</div>
            <Button variant="secondary" onClick={handleRefresh}>
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Use real user data from API or fallback to auth user data
  const userProfile = {
    email: userData?.profile.email || user?.email || "Not signed in",
    fullName: userData?.profile.full_name || user?.user_metadata?.full_name || user?.user_metadata?.name || "Guest User",
    subscription: userData?.profile.subscription_tier || "free",
    credits: userData?.profile.credits || 0,
  };

  const preferences = {
    theme: userData?.preferences.ui.theme || "dark",
    defaultModel: userData?.preferences.model.default_model || null, // Allow null instead of hardcoded fallback
    temperature: userData?.preferences.model.temperature || 0.7,
    systemPrompt: userData?.preferences.model.system_prompt || "You are a helpful AI assistant.",
  };

  const analytics = {
    messagesToday: 
      (userData?.today.messages_sent || 0) + 
      (userData?.today.messages_received || 0),
    tokensToday: userData?.today.total_tokens || 0,
    messagesAllTime: userData?.allTime.total_messages || 0,
    tokensAllTime: userData?.allTime.total_tokens || 0,
    sessionsToday: userData?.today.sessions_created || 0,
    activeMinutesToday: userData?.today.active_minutes || 0,
  };

  // Available models from the user data
  const availableModels = userData?.availableModels || [];

  // Handle edit mode toggle
  const handleEditToggle = () => {
    if (isEditing) {
      // Cancel editing - reset to current values
      setEditedPreferences({
        theme: preferences.theme,
        defaultModel: preferences.defaultModel,
        temperature: preferences.temperature,
        systemPrompt: preferences.systemPrompt,
      });
      setIsEditing(false);
      setSystemPromptError(null);
    } else {
      // Start editing - initialize with current values
      setEditedPreferences({
        theme: preferences.theme,
        defaultModel: preferences.defaultModel,
        temperature: preferences.temperature,
        systemPrompt: preferences.systemPrompt,
      });
      setLastKnownGoodSystemPrompt(preferences.systemPrompt);
      setIsEditing(true);
      setSystemPromptError(null);
    }
  };

  // Handle preference save
  const handleSave = async () => {
    try {
      setSystemPromptError(null);
      setIsSaving(true);

      // Validate system prompt before saving
      const validation = validateSystemPrompt(editedPreferences.systemPrompt);
      if (!validation.isValid) {
        setSystemPromptError(validation.error || 'Invalid system prompt');
        toast.error(validation.error || 'Invalid system prompt');
        setIsSaving(false);
        return;
      }

      // Optimistic update: Show loading state immediately
      const loadingToast = toast.loading('Saving preferences...', { id: 'save-preferences' });

      try {
        await updatePreferences({
          ui: { theme: editedPreferences.theme },
          model: {
            default_model: editedPreferences.defaultModel,
            temperature: editedPreferences.temperature,
            system_prompt: validation.trimmedValue, // Use validated and trimmed value
          }
        });

        // Success flow: Update UI state and show success message
        setIsEditing(false);
        setLastKnownGoodSystemPrompt(validation.trimmedValue || editedPreferences.systemPrompt); // Update last known good value
        
        // Update toast to success
        toast.success('Preferences saved successfully!', { id: 'save-preferences' });
        
      } catch (updateError) {
        // Dismiss loading toast first
        toast.dismiss(loadingToast);
        throw updateError; // Re-throw to be caught by outer catch
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save preferences';
      toast.error(errorMessage, { id: 'save-preferences' });
      
      // Enhanced error recovery: Revert to last known good state
      setEditedPreferences(prev => ({
        ...prev,
        systemPrompt: lastKnownGoodSystemPrompt,
        // Keep other fields as they were to allow user to retry
        theme: prev.theme,
        defaultModel: prev.defaultModel,
        temperature: prev.temperature,
      }));
      setSystemPromptError(null);
      
      // Stay in edit mode to allow user to retry
      // setIsEditing remains true so user can correct and retry
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg shadow-xl w-full max-w-lg p-6 overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">User Settings</h2>
        </div>

        <section className="mb-6">
          <h3 className="text-lg font-medium mb-2">Profile</h3>
          <p className="text-sm mb-1">Email: {userProfile.email}</p>
          <p className="text-sm mb-1">Name: {userProfile.fullName}</p>
          <p className="text-sm mb-1">
            Subscription: <span className="capitalize">{userProfile.subscription}</span>
          </p>
          {userProfile.credits > 0 && (
            <p className="text-sm">Credits: {userProfile.credits}</p>
          )}
        </section>

        <section className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-medium">Preferences</h3>
            <Button 
              variant="secondary" 
              onClick={handleEditToggle}
              disabled={loading || isSaving}
              className="text-xs px-2 py-1"
            >
              {isEditing ? 'Cancel' : 'Edit'}
            </Button>
          </div>

          {isEditing ? (
            <div className="space-y-4">
              {/* Theme Selection */}
              <div>
                <label className="block text-sm font-medium mb-1">Theme</label>
                <select
                  value={editedPreferences.theme}
                  onChange={(e) => setEditedPreferences(prev => ({ ...prev, theme: e.target.value }))}
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="system">System</option>
                </select>
              </div>

              {/* Model Selection */}
              <div>
                <label className="block text-sm font-medium mb-1">Default Model</label>
                <select
                  value={editedPreferences.defaultModel || ''} // Convert null to empty string for select
                  onChange={(e) => setEditedPreferences(prev => ({ 
                    ...prev, 
                    defaultModel: e.target.value === '' ? null : e.target.value // Convert empty string back to null
                  }))}
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  {/* "None" option as first item */}
                  <option value="">None</option>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {availableModels.map((model: any) => (
                    <option key={model.model_id} value={model.model_id}>
                      {model.model_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Temperature Slider */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Temperature: {editedPreferences.temperature}
                </label>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={editedPreferences.temperature}
                  onChange={(e) => setEditedPreferences(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>More focused</span>
                  <span>More creative</span>
                </div>
              </div>

              {/* System Prompt Editor */}
              <div>
                <label htmlFor="system-prompt-textarea" className="block text-sm font-medium mb-1">
                  System Prompt
                </label>
                <textarea
                  id="system-prompt-textarea"
                  value={editedPreferences.systemPrompt}
                  onChange={(e) => {
                    // Prevent typing beyond max length
                    const newValue = e.target.value;
                    if (newValue.length <= SYSTEM_PROMPT_LIMITS.MAX_LENGTH) {
                      setEditedPreferences(prev => ({ ...prev, systemPrompt: newValue }));
                    }
                    
                    // Real-time validation as user types
                    const validation = validateSystemPrompt(newValue);
                    setSystemPromptError(validation.isValid ? null : validation.error || null);
                  }}
                  onPaste={(e) => {
                    // Handle paste with automatic truncation
                    e.preventDefault();
                    const pastedText = e.clipboardData.getData('text');
                    const currentValue = editedPreferences.systemPrompt;
                    const cursorPosition = e.currentTarget.selectionStart;
                    
                    // Calculate what the new value would be after paste
                    const newValue = currentValue.slice(0, cursorPosition) + pastedText + currentValue.slice(e.currentTarget.selectionEnd);
                    
                    // Truncate if necessary
                    const truncatedValue = newValue.length > SYSTEM_PROMPT_LIMITS.MAX_LENGTH
                      ? newValue.slice(0, SYSTEM_PROMPT_LIMITS.MAX_LENGTH)
                      : newValue;
                    
                    setEditedPreferences(prev => ({ ...prev, systemPrompt: truncatedValue }));
                    
                    // Validate the pasted content
                    const validation = validateSystemPrompt(truncatedValue);
                    setSystemPromptError(validation.isValid ? null : validation.error || null);
                    
                    // Show toast if content was truncated
                    if (newValue.length > SYSTEM_PROMPT_LIMITS.MAX_LENGTH) {
                      toast(`Content truncated to ${SYSTEM_PROMPT_LIMITS.MAX_LENGTH} characters`, {
                        icon: '⚠️',
                        style: {
                          background: '#fef3c7',
                          color: '#92400e',
                        }
                      });
                    }
                  }}
                  className={`w-full p-2 border rounded resize-none transition-colors ${
                    systemPromptError 
                      ? 'border-red-500 bg-red-50 dark:bg-red-900/20' 
                      : editedPreferences.systemPrompt.length > 0 && systemPromptError === null
                      ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                      : 'border-gray-300 dark:border-gray-600'
                  } bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100`}
                  rows={4}
                  placeholder="Enter your system prompt to guide AI responses..."
                  aria-invalid={systemPromptError ? 'true' : 'false'}
                  aria-describedby={systemPromptError ? 'system-prompt-error' : 'system-prompt-help'}
                />
                
                {/* Enhanced Character Counter */}
                <div className="flex justify-between text-xs mt-1">
                  <div className="flex space-x-3">
                    <span className={`${
                      editedPreferences.systemPrompt.length > SYSTEM_PROMPT_LIMITS.MAX_LENGTH * 0.9 
                        ? 'text-yellow-600 dark:text-yellow-400' 
                        : editedPreferences.systemPrompt.length > SYSTEM_PROMPT_LIMITS.MAX_LENGTH * 0.8
                        ? 'text-orange-600 dark:text-orange-400'
                        : 'text-gray-500'
                    } font-mono`}>
                      {editedPreferences.systemPrompt.length} / {SYSTEM_PROMPT_LIMITS.MAX_LENGTH} chars
                    </span>
                    
                    {/* Word Count */}
                    <span className="text-gray-500">
                      {editedPreferences.systemPrompt.trim().split(/\s+/).filter(word => word.length > 0).length} words
                    </span>
                  </div>
                  
                  {/* Visual Warning Indicators */}
                  <div className="flex items-center space-x-2">
                    {editedPreferences.systemPrompt.length > SYSTEM_PROMPT_LIMITS.MAX_LENGTH * 0.9 && (
                      <span className="flex items-center text-yellow-600 dark:text-yellow-400">
                        ⚠️ <span className="ml-1">90%</span>
                      </span>
                    )}
                    
                    {editedPreferences.systemPrompt.length >= SYSTEM_PROMPT_LIMITS.MAX_LENGTH && (
                      <span className="flex items-center text-red-600 dark:text-red-400">
                        🚫 <span className="ml-1">Max</span>
                      </span>
                    )}
                    
                    {editedPreferences.systemPrompt.length > 0 && systemPromptError === null && (
                      <span className="text-green-600 dark:text-green-400">✓</span>
                    )}
                  </div>
                </div>

                {/* Inline Error and Help Messages */}
                {systemPromptError ? (
                  <div id="system-prompt-error" className="text-red-600 dark:text-red-400 text-xs mt-1 flex items-start">
                    <span className="mr-1">❌</span>
                    <span>{systemPromptError}</span>
                  </div>
                ) : (
                  <div id="system-prompt-help" className="text-gray-500 dark:text-gray-400 text-xs mt-1">
                    System prompt guides AI behavior and responses. Use clear, specific instructions.
                  </div>
                )}
              </div>

              {/* Save/Cancel Buttons */}
              <div className="flex space-x-2 pt-2">
                <Button
                  variant="primary"
                  onClick={handleSave}
                  disabled={loading || isSaving || systemPromptError !== null || editedPreferences.systemPrompt.trim().length === 0}
                  className={`flex-1 transition-all ${
                    systemPromptError !== null || editedPreferences.systemPrompt.trim().length === 0
                      ? 'opacity-50 cursor-not-allowed'
                      : (loading || isSaving)
                      ? 'opacity-75'
                      : 'hover:bg-blue-600'
                  }`}
                  title={
                    systemPromptError 
                      ? `Cannot save: ${systemPromptError}` 
                      : editedPreferences.systemPrompt.trim().length === 0
                      ? 'Cannot save: System prompt is empty'
                      : (loading || isSaving)
                      ? 'Saving changes...'
                      : 'Save all preferences'
                  }
                >
                  {(loading || isSaving) ? (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                      {isSaving ? 'Saving...' : 'Loading...'}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center">
                      {systemPromptError === null && editedPreferences.systemPrompt.trim().length > 0 && (
                        <span className="mr-2">✓</span>
                      )}
                      Save
                    </div>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-sm mb-1">
                Theme: <span className="capitalize">{preferences.theme}</span>
              </p>
              <p className="text-sm mb-1">
                Default Model: {
                  preferences.defaultModel === null || preferences.defaultModel === '' 
                    ? 'None' 
                    : (
                      // Check if current model exists in available models
                      availableModels.some((model: { model_id: string }) => model.model_id === preferences.defaultModel)
                        ? preferences.defaultModel
                        : `${preferences.defaultModel} (Not available)`
                    )
                }
              </p>
              <p className="text-sm mb-1">Temperature: {preferences.temperature}</p>
              <div className="text-sm">
                <span className="font-medium">System Prompt:</span>
                <div className="mt-1 p-2 bg-gray-50 dark:bg-gray-700 rounded text-xs leading-relaxed">
                  {truncateAtWordBoundary(preferences.systemPrompt)}
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="mb-6">
          <div className="flex items-center mb-2">
            <h3 className="text-lg font-medium">Analytics</h3>
            <button
              onClick={handleRefresh}
              disabled={refreshing || isRefreshAnimating}
              className="ml-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-50"
              title="Refresh analytics data"
            >
              <ArrowPathIcon 
                className={`w-5 h-5 ${(refreshing || isRefreshAnimating) ? 'animate-spin' : ''}`}
              />
            </button>
          </div>
          
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
              <p className="text-xs text-gray-600 dark:text-gray-400">Today</p>
              <p className="text-sm font-medium">{analytics.messagesToday} messages</p>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {analytics.tokensToday.toLocaleString()} tokens
              </p>
            </div>
            
            <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
              <p className="text-xs text-gray-600 dark:text-gray-400">All Time</p>
              <p className="text-sm font-medium">{analytics.messagesAllTime} messages</p>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {analytics.tokensAllTime.toLocaleString()} tokens
              </p>
            </div>
          </div>

          <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
            <p>Sessions today: {analytics.sessionsToday}</p>
            <p>Active time today: {analytics.activeMinutesToday} minutes</p>
          </div>
        </section>

        <div className="mt-6 flex justify-end">
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
