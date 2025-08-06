"use client";

import Button from "./Button";
import { useAuth } from "../../stores/useAuthStore";

interface UserSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function UserSettings({ isOpen, onClose }: Readonly<UserSettingsProps>) {
  const { user, isLoading } = useAuth();

  if (!isOpen) return null;

  // Show loading state if auth is still loading
  if (isLoading) {
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

  // Use actual user data from session or fallback to defaults
  const userProfile = {
    email: user?.email || "Not signed in",
    fullName: user?.user_metadata?.full_name || user?.user_metadata?.name || "Guest User",
    subscription: "Free", // TODO: Get this from user profile when available
  };

  const preferences = {
    theme: "Dark", // TODO: Get from user preferences
    defaultModel: "deepseek/deepseek-r1-0528:free", // TODO: Get from user preferences
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg shadow-xl w-full max-w-lg p-6 overflow-y-auto max-h-[90vh]">
        <h2 className="text-xl font-semibold mb-4">User Settings</h2>

        <section className="mb-6">
          <h3 className="text-lg font-medium mb-2">Profile</h3>
          <p className="text-sm">Email: {userProfile.email}</p>
          <p className="text-sm">Name: {userProfile.fullName}</p>
          <p className="text-sm">Subscription: {userProfile.subscription}</p>
        </section>

        <section className="mb-6">
          <h3 className="text-lg font-medium mb-2">Preferences</h3>
          <p className="text-sm">Theme: {preferences.theme}</p>
          <p className="text-sm">Default Model: {preferences.defaultModel}</p>
        </section>

        <section>
          <h3 className="text-lg font-medium mb-2">Analytics</h3>
          <p className="text-sm">Messages sent today: 42</p>
          <p className="text-sm">Tokens used today: 12345</p>
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
