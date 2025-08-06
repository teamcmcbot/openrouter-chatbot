"use client";

import { useState } from "react";
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import Button from "./Button";
import { useAuth } from "../../stores/useAuthStore";
import { useUserData } from "../../hooks/useUserData";

interface UserSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function UserSettings({ isOpen, onClose }: Readonly<UserSettingsProps>) {
  const { user, isLoading: authLoading } = useAuth();
  const { data: userData, loading, refreshing, error, updatePreferences, forceRefresh } = useUserData({ enabled: isOpen });
  
  // State for editing preferences
  const [isEditing, setIsEditing] = useState(false);
  const [editedPreferences, setEditedPreferences] = useState({
    theme: '',
    defaultModel: '',
    temperature: 0.7,
  });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

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
            <Button variant="secondary" onClick={forceRefresh}>
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
    defaultModel: userData?.preferences.model.default_model || "deepseek/deepseek-r1-0528:free",
    temperature: userData?.preferences.model.temperature || 0.7,
  };

  const analytics = {
    messagesToday: userData?.today.messages_sent || 0,
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
      });
      setIsEditing(false);
      setSaveError(null);
      setSaveSuccess(false);
    } else {
      // Start editing - initialize with current values
      setEditedPreferences({
        theme: preferences.theme,
        defaultModel: preferences.defaultModel,
        temperature: preferences.temperature,
      });
      setIsEditing(true);
      setSaveError(null);
      setSaveSuccess(false);
    }
  };

  // Handle preference save
  const handleSave = async () => {
    try {
      setSaveError(null);
      setSaveSuccess(false);

      await updatePreferences({
        ui: { theme: editedPreferences.theme },
        model: {
          default_model: editedPreferences.defaultModel,
          temperature: editedPreferences.temperature,
        }
      });

      setIsEditing(false);
      setSaveSuccess(true);
      
      // Clear success message after 3 seconds
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save preferences';
      setSaveError(errorMessage);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg shadow-xl w-full max-w-lg p-6 overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">User Settings</h2>
          {error && (
            <button
              onClick={forceRefresh}
              className="text-xs text-blue-500 hover:text-blue-600 underline"
              title="Refresh data"
            >
              Refresh
            </button>
          )}
        </div>

        {/* Success/Error Messages */}
        {saveSuccess && (
          <div className="mb-4 p-3 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded text-sm">
            Preferences saved successfully!
          </div>
        )}
        {saveError && (
          <div className="mb-4 p-3 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded text-sm">
            {saveError}
          </div>
        )}

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
              disabled={loading}
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
                  value={editedPreferences.defaultModel}
                  onChange={(e) => setEditedPreferences(prev => ({ ...prev, defaultModel: e.target.value }))}
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
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

              {/* Save/Cancel Buttons */}
              <div className="flex space-x-2 pt-2">
                <Button
                  variant="primary"
                  onClick={handleSave}
                  disabled={loading}
                  className="flex-1"
                >
                  {loading ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-sm mb-1">
                Theme: <span className="capitalize">{preferences.theme}</span>
              </p>
              <p className="text-sm mb-1">Default Model: {preferences.defaultModel}</p>
              <p className="text-sm">Temperature: {preferences.temperature}</p>
            </div>
          )}
        </section>

        <section className="mb-6">
          <div className="flex items-center mb-2">
            <h3 className="text-lg font-medium">Analytics</h3>
            <button
              onClick={forceRefresh}
              disabled={refreshing}
              className="ml-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-50"
              title="Refresh analytics data"
            >
              <ArrowPathIcon 
                className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`}
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
