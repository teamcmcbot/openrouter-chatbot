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
  
  // State for masking email and name
  const [isEmailMasked, setIsEmailMasked] = useState(true);
  const [isNameMasked, setIsNameMasked] = useState(true);
  
  // System prompt specific state
  const [systemPromptError, setSystemPromptError] = useState<string | null>(null);
  const [lastKnownGoodSystemPrompt, setLastKnownGoodSystemPrompt] = useState<string>('');

  // Utility functions for masking sensitive information
  const maskEmail = (email: string): string => {
    if (!email) return email;
    const [username, domain] = email.split('@');
    if (!username || !domain) return email;
    
    if (username.length <= 2) {
      return `${username.charAt(0)}***@${domain}`;
    }
    return `${username.charAt(0)}${'*'.repeat(username.length - 2)}${username.charAt(username.length - 1)}@${domain}`;
  };

  const maskName = (name: string): string => {
    if (!name) return name;
    const parts = name.split(' ');
    return parts.map(part => {
      if (part.length <= 2) {
        return `${part.charAt(0)}*`;
      }
      return `${part.charAt(0)}${'*'.repeat(part.length - 2)}${part.charAt(part.length - 1)}`;
    }).join(' ');
  };

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
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-2xl shadow-2xl w-full max-w-6xl overflow-hidden max-h-[95vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 dark:from-emerald-700 dark:to-emerald-800 px-6 py-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">Settings</h2>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white hover:bg-white/10 rounded-full p-2 transition-all duration-200"
              title="Close settings"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content - 3 column layout on desktop */}
        <div className="overflow-y-auto max-h-[calc(95vh-80px)] p-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-full">
            {/* Profile Section - Column 1 */}
            <section className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600 h-fit">
              <div className="flex items-center mb-3">
                <div className="bg-emerald-100 dark:bg-emerald-900 p-2 rounded-lg mr-3">
                  <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Profile</h3>
              </div>
              
              <div className="space-y-3">
                <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Email</div>
                    <button
                      onClick={() => setIsEmailMasked(!isEmailMasked)}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-1 rounded"
                      title={isEmailMasked ? "Show email" : "Hide email"}
                    >
                      {isEmailMasked ? (
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate font-mono">
                    {isEmailMasked ? maskEmail(userProfile.email) : userProfile.email}
                  </div>
                </div>
                
                <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Name</div>
                    <button
                      onClick={() => setIsNameMasked(!isNameMasked)}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-1 rounded"
                      title={isNameMasked ? "Show name" : "Hide name"}
                    >
                      {isNameMasked ? (
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {isNameMasked ? maskName(userProfile.fullName) : userProfile.fullName}
                  </div>
                </div>
                
                <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Subscription</div>
                  <div className="flex items-center">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                      userProfile.subscription === 'pro' 
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
                        : userProfile.subscription === 'enterprise'
                        ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                    }`}>
                      {userProfile.subscription}
                    </span>
                  </div>
                </div>
                
                {userProfile.credits > 0 && (
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                    <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Credits</div>
                    <div className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{userProfile.credits}</div>
                  </div>
                )}
              </div>
            </section>

            {/* Preferences Section - Column 2 */}
            <section className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600 h-fit">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center">
                  <div className="bg-emerald-100 dark:bg-emerald-900 p-2 rounded-lg mr-3">
                    <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Preferences</h3>
                </div>
                
                <Button 
                  variant={isEditing ? "secondary" : "primary"}
                  onClick={handleEditToggle}
                  disabled={loading || isSaving}
                  className="px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-200"
                >
                  {isEditing ? (
                    <div className="flex items-center">
                      <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Cancel
                    </div>
                  ) : (
                    <div className="flex items-center">
                      <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                      Edit
                    </div>
                  )}
                </Button>
              </div>

              {isEditing ? (
                <div className="space-y-3">
                  {/* Theme Selection */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      <div className="flex items-center mb-1">
                        <svg className="w-4 h-4 mr-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a4 4 0 014-4h10a4 4 0 014 4v12a4 4 0 01-4 4H7z" />
                        </svg>
                        Theme
                      </div>
                    </label>
                    <select
                      value={editedPreferences.theme}
                      onChange={(e) => setEditedPreferences(prev => ({ ...prev, theme: e.target.value }))}
                      className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors text-sm"
                    >
                      <option value="light">☀️ Light</option>
                      <option value="dark">🌙 Dark</option>
                      <option value="system">💻 System</option>
                    </select>
                  </div>

                  {/* Model Selection */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      <div className="flex items-center mb-1">
                        <svg className="w-4 h-4 mr-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                        </svg>
                        Default Model
                      </div>
                    </label>
                    <select
                      value={editedPreferences.defaultModel || ''}
                      onChange={(e) => setEditedPreferences(prev => ({ 
                        ...prev, 
                        defaultModel: e.target.value === '' ? null : e.target.value
                      }))}
                      className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors text-sm"
                    >
                      <option value="">🚫 None</option>
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {availableModels.map((model: any) => (
                        <option key={model.model_id} value={model.model_id}>
                          🤖 {model.model_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Temperature Slider */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <svg className="w-4 h-4 mr-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                          </svg>
                          Temperature
                        </div>
                        <span className="bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 px-2 py-1 rounded-full text-xs font-medium">
                          {editedPreferences.temperature}
                        </span>
                      </div>
                    </label>
                    <div className="space-y-2">
                      <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.1"
                        value={editedPreferences.temperature}
                        onChange={(e) => setEditedPreferences(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 slider"
                        style={{
                          background: `linear-gradient(to right, #10b981 0%, #10b981 ${(editedPreferences.temperature / 2) * 100}%, #e5e7eb ${(editedPreferences.temperature / 2) * 100}%, #e5e7eb 100%)`
                        }}
                      />
                      <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                        <span className="flex items-center">
                          <span className="w-2 h-2 bg-emerald-500 rounded-full mr-1"></span>
                          More focused
                        </span>
                        <span className="flex items-center">
                          <span className="w-2 h-2 bg-emerald-600 rounded-full mr-1"></span>
                          More creative
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* System Prompt Editor */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                    <label htmlFor="system-prompt-textarea" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      <div className="flex items-center mb-1">
                        <svg className="w-4 h-4 mr-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                        System Prompt
                      </div>
                    </label>
                    
                    <div className="relative">
                      <textarea
                        id="system-prompt-textarea"
                        value={editedPreferences.systemPrompt}
                        onChange={(e) => {
                          const newValue = e.target.value;
                          if (newValue.length <= SYSTEM_PROMPT_LIMITS.MAX_LENGTH) {
                            setEditedPreferences(prev => ({ ...prev, systemPrompt: newValue }));
                          }
                          
                          const validation = validateSystemPrompt(newValue);
                          setSystemPromptError(validation.isValid ? null : validation.error || null);
                        }}
                        onPaste={(e) => {
                          e.preventDefault();
                          const pastedText = e.clipboardData.getData('text');
                          const currentValue = editedPreferences.systemPrompt;
                          const cursorPosition = e.currentTarget.selectionStart;
                          
                          const newValue = currentValue.slice(0, cursorPosition) + pastedText + currentValue.slice(e.currentTarget.selectionEnd);
                          
                          const truncatedValue = newValue.length > SYSTEM_PROMPT_LIMITS.MAX_LENGTH
                            ? newValue.slice(0, SYSTEM_PROMPT_LIMITS.MAX_LENGTH)
                            : newValue;
                          
                          setEditedPreferences(prev => ({ ...prev, systemPrompt: truncatedValue }));
                          
                          const validation = validateSystemPrompt(truncatedValue);
                          setSystemPromptError(validation.isValid ? null : validation.error || null);
                          
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
                        className={`w-full p-3 border rounded-lg resize-none transition-all duration-200 text-sm ${
                          systemPromptError 
                            ? 'border-red-500 bg-red-50 dark:bg-red-900/20 focus:ring-red-500' 
                            : editedPreferences.systemPrompt.length > 0 && systemPromptError === null
                            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 focus:ring-emerald-500'
                            : 'border-gray-300 dark:border-gray-600 focus:ring-emerald-500'
                        } bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:border-transparent`}
                        rows={4}
                        placeholder="Enter your system prompt to guide AI responses..."
                        aria-invalid={systemPromptError ? 'true' : 'false'}
                        aria-describedby={systemPromptError ? 'system-prompt-error' : 'system-prompt-help'}
                      />
                      
                      {/* Status Indicator */}
                      <div className="absolute top-2 right-2">
                        {systemPromptError ? (
                          <div className="bg-red-100 dark:bg-red-900 p-1 rounded-full">
                            <svg className="w-3 h-3 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </div>
                        ) : editedPreferences.systemPrompt.length > 0 ? (
                          <div className="bg-emerald-100 dark:bg-emerald-900 p-1 rounded-full">
                            <svg className="w-3 h-3 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    
                    {/* Compact Character Counter */}
                    <div className="mt-2 space-y-1">
                      <div className="flex justify-between items-center text-xs">
                        <span className={`font-mono px-2 py-0.5 rounded ${
                          editedPreferences.systemPrompt.length > SYSTEM_PROMPT_LIMITS.MAX_LENGTH * 0.9 
                            ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                        }`}>
                          {editedPreferences.systemPrompt.length} / {SYSTEM_PROMPT_LIMITS.MAX_LENGTH}
                        </span>
                        
                        <span className="text-gray-500 dark:text-gray-400">
                          {editedPreferences.systemPrompt.trim().split(/\s+/).filter(word => word.length > 0).length} words
                        </span>
                      </div>

                      {/* Compact Progress Bar */}
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1">
                        <div 
                          className={`h-1 rounded-full transition-all duration-300 ${
                            editedPreferences.systemPrompt.length >= SYSTEM_PROMPT_LIMITS.MAX_LENGTH
                              ? 'bg-red-500'
                              : editedPreferences.systemPrompt.length > SYSTEM_PROMPT_LIMITS.MAX_LENGTH * 0.9
                              ? 'bg-yellow-500'
                              : 'bg-emerald-500'
                          }`}
                          style={{
                            width: `${Math.min((editedPreferences.systemPrompt.length / SYSTEM_PROMPT_LIMITS.MAX_LENGTH) * 100, 100)}%`
                          }}
                        />
                      </div>

                      {/* Compact Error/Help Messages */}
                      {systemPromptError ? (
                        <div className="text-red-600 dark:text-red-400 text-xs">
                          ❌ {systemPromptError}
                        </div>
                      ) : (
                        <div className="text-gray-500 dark:text-gray-400 text-xs">
                          💡 Guide AI behavior with clear instructions
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Save Button */}
                  <div className="pt-3">
                    <Button
                      variant="primary"
                      onClick={handleSave}
                      disabled={loading || isSaving || systemPromptError !== null || editedPreferences.systemPrompt.trim().length === 0}
                      className="w-full"
                    >
                      {(loading || isSaving) ? (
                        <div className="flex items-center">
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          {isSaving ? 'Saving...' : 'Loading...'}
                        </div>
                      ) : (
                        <div className="flex items-center">
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Save Changes
                        </div>
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                    <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Theme</div>
                    <div className="flex items-center">
                      <span className="text-sm mr-2">
                        {preferences.theme === 'light' ? '☀️' : preferences.theme === 'dark' ? '🌙' : '💻'}
                      </span>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100 capitalize">{preferences.theme}</span>
                    </div>
                  </div>
                  
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                    <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Default Model</div>
                    <div className="flex items-center">
                      <span className="text-sm mr-2">🤖</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {preferences.defaultModel === null || preferences.defaultModel === '' 
                          ? 'None' 
                          : (
                            availableModels.some((model: { model_id: string }) => model.model_id === preferences.defaultModel)
                              ? preferences.defaultModel
                              : `${preferences.defaultModel} (Not available)`
                          )
                        }
                      </span>
                    </div>
                  </div>
                  
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                    <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Temperature</div>
                    <div className="flex items-center">
                      <span className="text-sm mr-2">🌡️</span>
                      <div className="flex items-center space-x-2 flex-1">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{preferences.temperature}</span>
                        <div className="w-16 h-2 bg-gray-200 dark:bg-gray-700 rounded-full">
                          <div 
                            className="h-2 bg-emerald-500 rounded-full transition-all duration-300"
                            style={{ width: `${(preferences.temperature / 2) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                    <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">System Prompt</div>
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-2 border-l-4 border-emerald-500">
                      <div className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
                        {truncateAtWordBoundary(preferences.systemPrompt)}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* Analytics Section - Column 3 */}
            <section className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600 h-fit">
              <div className="flex items-center mb-3">
                <div className="bg-emerald-100 dark:bg-emerald-900 p-2 rounded-lg mr-3">
                  <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Analytics</h3>
                <button
                  onClick={handleRefresh}
                  disabled={refreshing || isRefreshAnimating}
                  className="ml-auto text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-50 p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-all duration-200"
                  title="Refresh analytics data"
                >
                  <ArrowPathIcon 
                    className={`w-4 h-4 ${(refreshing || isRefreshAnimating) ? 'animate-spin' : ''}`}
                  />
                </button>
              </div>
              
              {/* Compact Analytics */}
              <div className="space-y-3">
                {/* Today Stats */}
                <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/30 dark:to-emerald-800/30 rounded-lg p-3 border border-emerald-200 dark:border-emerald-800">
                  <div className="flex items-center mb-2">
                    <div className="bg-emerald-500 p-1 rounded mr-2">
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                    </div>
                    <h4 className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">Today</h4>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="text-emerald-700 dark:text-emerald-300">Messages</div>
                      <div className="font-bold text-emerald-900 dark:text-emerald-100">{analytics.messagesToday}</div>
                    </div>
                    <div>
                      <div className="text-emerald-700 dark:text-emerald-300">Tokens</div>
                      <div className="font-semibold text-emerald-900 dark:text-emerald-100">{analytics.tokensToday.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-emerald-700 dark:text-emerald-300">Sessions</div>
                      <div className="font-semibold text-emerald-900 dark:text-emerald-100">{analytics.sessionsToday}</div>
                    </div>
                    <div>
                      <div className="text-emerald-700 dark:text-emerald-300">Active Time</div>
                      <div className="font-semibold text-emerald-900 dark:text-emerald-100">{analytics.activeMinutesToday}m</div>
                    </div>
                  </div>
                </div>
                
                {/* All Time Stats */}
                <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700/30 dark:to-gray-600/30 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                  <div className="flex items-center mb-2">
                    <div className="bg-gray-500 p-1 rounded mr-2">
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                    </div>
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">All Time</h4>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="text-gray-700 dark:text-gray-300">Messages</div>
                      <div className="font-bold text-gray-900 dark:text-gray-100">{analytics.messagesAllTime}</div>
                    </div>
                    <div>
                      <div className="text-gray-700 dark:text-gray-300">Tokens</div>
                      <div className="font-semibold text-gray-900 dark:text-gray-100">{analytics.tokensAllTime.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-gray-700 dark:text-gray-300">Growth Rate</div>
                      <div className="font-semibold text-gray-900 dark:text-gray-100">
                        {analytics.messagesAllTime > 0 ? `${Math.round((analytics.messagesToday / analytics.messagesAllTime) * 100 * 365)}%/yr` : 'N/A'}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-700 dark:text-gray-300">Avg/Msg</div>
                      <div className="font-semibold text-gray-900 dark:text-gray-100">
                        {analytics.messagesAllTime > 0 ? Math.round(analytics.tokensAllTime / analytics.messagesAllTime) : 0}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
