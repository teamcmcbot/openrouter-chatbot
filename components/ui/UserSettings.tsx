"use client";

import { useState, useEffect } from "react";
// Added icons for section headers and controls
import { ArrowPathIcon, UserCircleIcon, AdjustmentsHorizontalIcon, ChartBarIcon, XMarkIcon, Cog6ToothIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import { useRouter } from 'next/navigation';
import Tooltip from "./Tooltip";
import TierBadge from "./TierBadge";
import Button from "./Button";
import { useAuth } from "../../stores/useAuthStore";
import { useUserData } from "../../hooks/useUserData";
import { validateSystemPrompt, truncateAtWordBoundary, SYSTEM_PROMPT_LIMITS } from "../../lib/utils/validation/systemPrompt";
import toast from 'react-hot-toast';
import { useTheme } from "../../stores/useUIStore";

interface UserSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function UserSettings({ isOpen, onClose }: Readonly<UserSettingsProps>) {
  // UI notes:
  // - In Preferences view mode, labels (Theme, Default Model, Temperature, System Prompt)
  //   use muted text colors to differentiate them from values, which use stronger font/color.
  // - System Prompt preview shows a truncated value by default with a "Read more" toggle
  //   (showFullSystemPrompt) to expand/collapse long content without entering edit mode.
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const { data: userData, loading, refreshing, error, updatePreferences, forceRefresh } = useUserData({ enabled: isOpen });
  const { theme, setTheme } = useTheme();
  // Normalize any legacy/non-binary theme to 'dark'
  const normalizeTheme = (t?: string): 'light' | 'dark' => (t === 'light' ? 'light' : 'dark');
  
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
  // View-mode: expand/collapse long system prompt
  const [showFullSystemPrompt, setShowFullSystemPrompt] = useState(false);
  
  // New: profile field visibility toggles (default masked)
  const [showEmail, setShowEmail] = useState(false);
  const [showName, setShowName] = useState(false);
  
  // System prompt specific state
  const [systemPromptError, setSystemPromptError] = useState<string | null>(null);
  const [lastKnownGoodSystemPrompt, setLastKnownGoodSystemPrompt] = useState<string>('');
  const [lastKnownTheme, setLastKnownTheme] = useState<'light' | 'dark'>(normalizeTheme(theme));

  // Ensure fresh data each time the modal opens (covers ChatSidebar path where component stays mounted)
  useEffect(() => {
    if (isOpen) {
      // Fire and forget; UI uses `refreshing` state subtly without blocking the modal
      void forceRefresh();
    }
  }, [isOpen, forceRefresh]);

  // State synchronization: Update edited preferences when userData changes (after successful save)
  useEffect(() => {
    if (userData?.preferences && !isEditing) {
      const currentPrefs = {
        theme: normalizeTheme(userData.preferences.ui.theme || "dark"),
        defaultModel: userData.preferences.model.default_model || null,
        temperature: userData.preferences.model.temperature || 0.7,
        systemPrompt: userData.preferences.model.system_prompt || "You are a helpful AI assistant.",
      };
      
      setEditedPreferences(currentPrefs);
      setLastKnownGoodSystemPrompt(currentPrefs.systemPrompt);
    }
  }, [userData?.preferences, isEditing]);

  // Helper: mask email and name
  const maskEmail = (email: string) => {
    if (!email || !email.includes('@')) return '••••••••••';
    const [local, domain] = email.split('@');
    const maskedLocal = local.length <= 2
      ? local[0] + '•'.repeat(Math.max(0, local.length - 1))
      : local[0] + '•'.repeat(local.length - 2) + local[local.length - 1];
    const domainParts = domain.split('.');
    const d0 = domainParts[0] || '';
    const maskedD0 = d0 ? d0[0] + '•'.repeat(Math.max(1, d0.length - 1)) : '•'.repeat(3);
    const rest = domainParts.slice(1).join('.');
    return `${maskedLocal}@${maskedD0}${rest ? '.' + rest : ''}`;
  };

  const maskName = (name: string) => {
    if (!name) return '••••••';
    return name
      .split(/\s+/)
      .filter(Boolean)
      .map(part => part[0] + (part.length > 1 ? '•'.repeat(Math.min(3, part.length - 1)) : ''))
      .join(' ');
  };

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
    isBanned: Boolean(userData?.profile.is_banned) || (userData?.profile.banned_until ? new Date(userData.profile.banned_until).getTime() > Date.now() : false),
    bannedUntil: userData?.profile.banned_until || null,
    banReason: userData?.profile.ban_reason || null,
  };

  // Subscription (tier) label used by TierBadge
  const tierLower = (userProfile.subscription || '').toLowerCase();

  const preferences = {
    theme: normalizeTheme(userData?.preferences.ui.theme || "dark"),
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
    generationMsToday: userData?.today.generation_ms || 0,
  };

  // Average assistant response latency (generation_ms per assistant message received)
  const messagesReceivedToday = userData?.today.messages_received || 0;
  const avgResponseMs = messagesReceivedToday > 0
    ? Math.round(analytics.generationMsToday / messagesReceivedToday)
    : 0;
  const formatAvgLatency = (ms: number) => {
    if (!ms || ms <= 0) return '0 ms';
    if (ms < 1000) return `${ms} ms`;
    const s = ms / 1000;
    return `${s.toFixed(1)}s`;
  };

  // Analytics helpers and derived values for tooltips
  const nf = new Intl.NumberFormat();
  const oneDecimal = (n: number) => Math.round(n * 10) / 10;
  const pct = (part: number, total: number) => {
    if (!total || total <= 0 || !isFinite(total)) return '—';
    return `${oneDecimal((part / total) * 100)}%`;
  };
  const relTime = (iso?: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    const diff = Date.now() - d.getTime();
    const abs = Math.abs(diff);
    const min = 60 * 1000;
    const hr = 60 * min;
    const day = 24 * hr;
    if (abs < 30 * 1000) return 'just now';
    if (abs < hr) return `${Math.floor(abs / min)} min ago`;
    if (abs < day) return `${Math.floor(abs / hr)} hr ago`;
    return `${Math.floor(abs / day)} d ago`;
  };

  const todayRaw = (userData?.today ?? {}) as {
    messages_sent?: number;
    messages_received?: number;
    total_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
    models_used?: Record<string, number>;
    sessions_created?: number;
  generation_ms?: number;
  };
  const allTimeRaw = (userData?.allTime ?? {}) as {
    total_messages?: number;
    total_tokens?: number;
    sessions_created?: number;
    last_reset?: string;
  };
  const ts = (userData?.timestamps ?? {}) as {
    created_at?: string;
    updated_at?: string;
    last_active?: string;
  };

  const todaySent = todayRaw.messages_sent || 0;
  const todayRecv = todayRaw.messages_received || 0;
  const todayIn = todayRaw.input_tokens || 0;
  const todayOut = todayRaw.output_tokens || 0;
  const todayTotal = todayRaw.total_tokens || analytics.tokensToday;
  const todayAvgTpm = analytics.messagesToday > 0 ? Math.round(todayTotal / analytics.messagesToday) : 0;
  // Sort models by usage desc and limit to top 5 for tooltip readability
  const todayModelsAll: Array<[string, number]> = Object.entries((todayRaw.models_used || {}) as Record<string, number>);
  const todayModelsSorted = [...todayModelsAll].sort((a, b) => b[1] - a[1]);
  const todayModelsTop5 = todayModelsSorted.slice(0, 5);
  const todayModelsMoreCount = Math.max(0, todayModelsAll.length - 5);

  const allMsgs = analytics.messagesAllTime;
  const allTokens = analytics.tokensAllTime;
  const allAvgTpm = allMsgs > 0 ? Math.round(allTokens / allMsgs) : 0;
  const allSessions = allTimeRaw.sessions_created || 0;
  const msgsPerSession = allSessions > 0 ? oneDecimal(allMsgs / allSessions) : 0;
  const tokensPerSession = allSessions > 0 ? Math.round(allTokens / allSessions) : 0;

  // Available models from the user data
  const availableModels = userData?.availableModels || [];

  // Handle edit mode toggle
  const handleEditToggle = () => {
    if (isEditing) {
      // Cancel editing - reset to current values and revert theme preview
      setEditedPreferences({
        theme: preferences.theme,
        defaultModel: preferences.defaultModel,
        temperature: preferences.temperature,
        systemPrompt: preferences.systemPrompt,
      });
      setTheme(lastKnownTheme);
      setIsEditing(false);
      setSystemPromptError(null);
    } else {
      // Start editing - initialize with current values and capture current theme
      setEditedPreferences({
        theme: preferences.theme,
        defaultModel: preferences.defaultModel,
        temperature: preferences.temperature,
        systemPrompt: preferences.systemPrompt,
      });
      setLastKnownGoodSystemPrompt(preferences.systemPrompt);
  setLastKnownTheme(normalizeTheme(theme));
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
        // Optimistically update theme for immediate UI feedback
        setLastKnownTheme(normalizeTheme(theme));
        if (editedPreferences.theme && normalizeTheme(editedPreferences.theme) !== normalizeTheme(theme)) {
          setTheme(normalizeTheme(editedPreferences.theme));
        }
        await updatePreferences({
          ui: { theme: normalizeTheme(editedPreferences.theme) },
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
  // Rollback theme if update fails
  setTheme(lastKnownTheme);
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
  // Also rollback theme in case outer catch path was hit
  setTheme(lastKnownTheme);
      
      // Stay in edit mode to allow user to retry
      // setIsEditing remains true so user can correct and retry
    } finally {
      setIsSaving(false);
    }
  };

  return (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Modern, slightly blurred overlay */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal container with sticky header/footer and internal scroll */}
  <div className="relative w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-white/10 bg-white/95 dark:bg-gray-900/90 text-slate-900 dark:text-gray-100 shadow-2xl backdrop-blur-xl overflow-hidden">
        {/* Sticky header (aligned with section padding) */}
  <div className="sticky top-0 z-10 px-6 py-4 md:py-5 bg-gradient-to-b from-white/95 to-white/80 dark:from-gray-900/90 dark:to-gray-900/70 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
              <Cog6ToothIcon className="h-5 w-5" />
            </span>
            <h2 className="text-xl font-semibold">User Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
            aria-label="Close settings"
            title="Close"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="px-6 py-5 space-y-6 overflow-y-auto max-h-[80vh] md:max-h-[75vh]">
          {/* Profile */}
          <section className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-gray-800/60 p-4 md:p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <UserCircleIcon className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                <h3 className="text-base font-semibold">Profile</h3>
              </div>
              <TierBadge tier={tierLower} side="bottom" align="end" widthClassName="w-64 sm:w-72" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="space-y-1">
                <p className="text-gray-500 dark:text-gray-400">Email</p>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium break-all">{showEmail ? userProfile.email : maskEmail(userProfile.email)}</p>
                  <button
                    onClick={() => setShowEmail(v => !v)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-white/60 dark:hover:bg-white/10 text-gray-500 dark:text-gray-400"
                    aria-label={showEmail ? 'Hide email' : 'Show email'}
                    title={showEmail ? 'Hide email' : 'Show email'}
                  >
                    {showEmail ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-gray-500 dark:text-gray-400">Name</p>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{showName ? userProfile.fullName : maskName(userProfile.fullName)}</p>
                  <button
                    onClick={() => setShowName(v => !v)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-white/60 dark:hover:bg-white/10 text-gray-500 dark:text-gray-400"
                    aria-label={showName ? 'Hide name' : 'Show name'}
                    title={showName ? 'Hide name' : 'Show name'}
                  >
                    {showName ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-gray-500 dark:text-gray-400">Account Status</p>
                <div className="font-medium">
                  {userProfile.isBanned ? (
                    <div className="inline-flex items-center gap-2 text-red-600 dark:text-red-400">
                      <span className="inline-block w-2 h-2 rounded-full bg-red-600 dark:bg-red-400" />
                      <span>Banned{userProfile.bannedUntil ? ` until ${new Date(userProfile.bannedUntil).toLocaleString()}` : ''}</span>
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                      <span className="inline-block w-2 h-2 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                      <span>Active</span>
                    </div>
                  )}
                  {userProfile.isBanned && userProfile.banReason && (
                    <div className="mt-1 text-xs text-gray-600 dark:text-gray-400">Reason: {userProfile.banReason}</div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Preferences */}
          <section className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-gray-800/60 p-4 md:p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <AdjustmentsHorizontalIcon className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                <h3 className="text-base font-semibold">Preferences</h3>
              </div>
              <Button 
                variant="secondary" 
                onClick={handleEditToggle}
                disabled={loading || isSaving}
                className="text-xs px-3 py-1.5"
              >
                {isEditing ? 'Cancel' : 'Edit'}
              </Button>
            </div>

            {isEditing ? (
              <div className="space-y-4">
                {/* Theme Selection */}
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-600 dark:text-gray-400">Theme</label>
                  <select
                    value={normalizeTheme(editedPreferences.theme)}
                    onChange={(e) => {
                      const value = e.target.value as 'light' | 'dark';
                      // Do NOT apply theme immediately; only update edited state
                      setEditedPreferences(prev => ({ ...prev, theme: value }));
                    }}
                    className="w-full p-2.5 rounded-lg border border-slate-300/70 dark:border-gray-600/60 bg-white dark:bg-gray-900/50 text-slate-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  >
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </div>

                {/* Model Selection */}
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-600 dark:text-gray-400">Default Model</label>
                  <select
                    value={editedPreferences.defaultModel || ''}
                    onChange={(e) => setEditedPreferences(prev => ({
                      ...prev,
                      defaultModel: e.target.value === '' ? null : e.target.value,
                    }))}
                    className="w-full p-2.5 rounded-lg border border-slate-300/70 dark:border-gray-600/60 bg-white dark:bg-gray-900/50 text-slate-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  >
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
                  <label className="flex items-center justify-between text-sm font-medium mb-1 text-slate-600 dark:text-gray-400">
                    <span>Temperature</span>
                    <span className="ml-2 font-semibold text-gray-900 dark:text-gray-100">{editedPreferences.temperature}</span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={editedPreferences.temperature}
                    onChange={(e) => setEditedPreferences(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))}
                    className="w-full accent-emerald-600"
                  />
                  <div className="flex justify-between text-xs text-slate-500 mt-1">
                    <span>More focused</span>
                    <span>More creative</span>
                  </div>
                </div>

                {/* System Prompt Editor */}
                <div>
                  <label htmlFor="system-prompt-textarea" className="block text-sm font-medium mb-1 text-slate-600 dark:text-gray-400">
                    System Prompt
                  </label>
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
                          style: { background: '#fef3c7', color: '#92400e' }
                        });
                      }
                    }}
          className={`w-full p-3 rounded-xl resize-none transition-colors shadow-sm ${
                      systemPromptError 
                        ? 'border border-red-500 bg-red-50 dark:bg-red-900/20' 
                        : editedPreferences.systemPrompt.length > 0 && systemPromptError === null
                        ? 'border border-green-500 bg-green-50 dark:bg-green-900/20'
            : 'border border-slate-300/70 dark:border-gray-600/60 bg-white dark:bg-gray-900/50'
          } text-slate-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50`}
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
                      <span className="text-gray-500">
                        {editedPreferences.systemPrompt.trim().split(/\s+/).filter(word => word.length > 0).length} words
                      </span>
                    </div>
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

                  {systemPromptError ? (
                    <div id="system-prompt-error" className="text-red-600 dark:text-red-400 text-xs mt-1 flex items-start">
                      <span className="mr-1">❌</span>
                      <span>{systemPromptError}</span>
                    </div>
                  ) : (
                    <div id="system-prompt-help" className="text-slate-500 dark:text-gray-400 text-xs mt-1">
                      System prompt guides AI behavior and responses. Use clear, specific instructions.
                    </div>
                  )}
                </div>

                {/* Save Button */}
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="primary"
                    onClick={handleSave}
                    disabled={loading || isSaving || systemPromptError !== null || editedPreferences.systemPrompt.trim().length === 0}
                    className={`min-w-[120px] transition-all ${
                      systemPromptError !== null || editedPreferences.systemPrompt.trim().length === 0
                        ? 'opacity-50 cursor-not-allowed'
                        : (loading || isSaving)
                        ? 'opacity-75'
                        : 'hover:bg-emerald-600'
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
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-x-4 items-start text-sm">
                  <div className="sm:col-span-3 text-slate-600 dark:text-gray-400 mb-1 sm:mb-0">Theme</div>
                  <div className="sm:col-span-9 font-medium text-slate-900 dark:text-gray-100 capitalize">{preferences.theme}</div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-x-4 items-start text-sm">
                  <div className="sm:col-span-3 text-slate-600 dark:text-gray-400 mb-1 sm:mb-0">Default Model</div>
                  <div className="sm:col-span-9 font-medium text-slate-900 dark:text-gray-100">
                    {
                      preferences.defaultModel === null || preferences.defaultModel === ''
                        ? <span className="text-slate-700 dark:text-gray-300">None</span>
                        : (
                          availableModels.some((model: { model_id: string }) => model.model_id === preferences.defaultModel)
                            ? preferences.defaultModel
                            : <span className="text-amber-600 dark:text-amber-400">{`${preferences.defaultModel} (Not available)`}</span>
                        )
                    }
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-x-4 items-start text-sm">
                  <div className="sm:col-span-3 text-slate-600 dark:text-gray-400 mb-1 sm:mb-0">Temperature</div>
                  <div className="sm:col-span-9 font-medium text-slate-900 dark:text-gray-100">{preferences.temperature}</div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-x-4 items-start text-sm">
                  <div className="sm:col-span-3 text-slate-600 dark:text-gray-400 mt-0.5">System Prompt</div>
                  <div className="sm:col-span-9">
                    <div
                      id="system-prompt-preview"
                      className="mt-0.5 p-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-white/10 rounded-lg text-xs leading-relaxed whitespace-pre-wrap"
                      aria-live="polite"
                    >
                      {showFullSystemPrompt
                        ? preferences.systemPrompt
                        : truncateAtWordBoundary(preferences.systemPrompt)}
                    </div>
                    {preferences.systemPrompt.length > 200 && (
                      <button
                        type="button"
                        className="mt-2 text-xs font-medium text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
                        aria-expanded={showFullSystemPrompt}
                        aria-controls="system-prompt-preview"
                        onClick={() => setShowFullSystemPrompt(v => !v)}
                      >
                        {showFullSystemPrompt ? 'Show less' : 'Read more'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Analytics */}
          <section className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-gray-800/60 p-4 md:p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ChartBarIcon className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                <h3 className="text-base font-semibold">Analytics</h3>
              </div>
              <button
                onClick={handleRefresh}
                disabled={refreshing || isRefreshAnimating}
                className="ml-2 inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-50 hover:bg-white/60 dark:hover:bg-white/10"
                title="Refresh analytics data"
              >
                <ArrowPathIcon 
                  className={`w-5 h-5 ${(refreshing || isRefreshAnimating) ? 'animate-spin' : ''}`}
                />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
              {/* Today card with tooltip */}
              <Tooltip
                side="top"
                widthClassName="w-72 sm:w-80"
                className="rounded-lg bg-white/70 dark:bg-gray-900/40 border border-gray-200/60 dark:border-white/10 shadow-sm outline-none focus:ring-2 focus:ring-emerald-500/40"
                content={(
                  <div className="space-y-1">
                    <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Messages</span><span className="font-medium">{nf.format(analytics.messagesToday)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Sent · Received</span><span className="font-medium">{nf.format(todaySent)} · {nf.format(todayRecv)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Tokens (in · out)</span><span className="font-medium">{nf.format(todayIn)} · {nf.format(todayOut)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Share (in/out)</span><span className="font-medium">{pct(todayIn, todayTotal)} / {pct(todayOut, todayTotal)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Avg tokens/msg</span><span className="font-medium">{nf.format(todayAvgTpm)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Sessions</span><span className="font-medium">{nf.format(analytics.sessionsToday)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Avg response</span><span className="font-medium">{formatAvgLatency(avgResponseMs)}</span></div>
                    {todayModelsTop5.length > 0 && (
                      <div>
                        <div className="text-gray-600 dark:text-gray-400">Models used</div>
                        <ul className="mt-1 space-y-0.5">
                          {todayModelsTop5.map(([id, count]) => (
                            <li key={id} className="truncate"><span className="font-medium">{count}×</span> <span className="text-gray-700 dark:text-gray-300">{id}</span></li>
                          ))}
                        </ul>
                        {todayModelsMoreCount > 0 && (
                          <div className="mt-1 text-xs text-gray-600 dark:text-gray-400">and {todayModelsMoreCount} more…</div>
                        )}
                      </div>
                    )}
                    <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Last active</span><span className="font-medium">{relTime(ts.last_active)}</span></div>
                  </div>
                )}
              >
                <div className="p-4">
                  <p className="text-xs text-gray-600 dark:text-gray-400">Today</p>
                  <p className="text-sm font-semibold">{analytics.messagesToday} messages</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">{analytics.tokensToday.toLocaleString()} tokens</p>
                </div>
              </Tooltip>
              {/* All time card with tooltip */}
              <Tooltip
                side="top"
                widthClassName="w-72 sm:w-80"
                className="rounded-lg bg-white/70 dark:bg-gray-900/40 border border-gray-200/60 dark:border-white/10 shadow-sm outline-none focus:ring-2 focus:ring-emerald-500/40"
                content={(
                  <div className="space-y-1">
                    <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Messages</span><span className="font-medium">{nf.format(allMsgs)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Tokens</span><span className="font-medium">{nf.format(allTokens)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Avg tokens/msg</span><span className="font-medium">{nf.format(allAvgTpm)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Sessions</span><span className="font-medium">{nf.format(allSessions)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Msgs/session</span><span className="font-medium">{msgsPerSession || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Tokens/session</span><span className="font-medium">{tokensPerSession ? nf.format(tokensPerSession) : '—'}</span></div>
                    <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Since reset</span><span className="font-medium">{allTimeRaw.last_reset ? new Date(allTimeRaw.last_reset).toLocaleDateString() : '—'}</span></div>
                    <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Updated</span><span className="font-medium">{relTime(ts.updated_at)}</span></div>
                  </div>
                )}
              >
                <div className="p-4">
                  <p className="text-xs text-gray-600 dark:text-gray-400">All Time</p>
                  <p className="text-sm font-semibold">{analytics.messagesAllTime} messages</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">{analytics.tokensAllTime.toLocaleString()} tokens</p>
                </div>
              </Tooltip>
            </div>

      <div className="text-xs text-slate-600 dark:text-gray-400 space-y-1">
              <p>Sessions today: {analytics.sessionsToday}</p>
              <p>Average response time today: {formatAvgLatency(avgResponseMs)}</p>
              <button
                type="button"
                onClick={() => { onClose(); router.push('/usage/costs'); }}
        className="mt-2 inline-flex items-center px-3 py-1.5 rounded-md ring-1 ring-emerald-600 text-emerald-700 dark:text-emerald-400 text-xs font-medium bg-white hover:bg-emerald-50 dark:bg-transparent dark:hover:bg-emerald-900/30"
              >View Usage</button>
            </div>
          </section>
        </div>

        {/* Removed footer close button; header X handles closing */}
      </div>
    </div>
  );
}
