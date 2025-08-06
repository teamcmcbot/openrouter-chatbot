"use client";

import Button from "./Button";

interface UserSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function UserSettings({ isOpen, onClose }: Readonly<UserSettingsProps>) {
  if (!isOpen) return null;

  const user = {
    email: "user@example.com",
    fullName: "Jane Doe",
    subscription: "Free",
  };

  const preferences = {
    theme: "Light",
    defaultModel: "gpt-3.5",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg shadow-xl w-full max-w-lg p-6 overflow-y-auto max-h-[90vh]">
        <h2 className="text-xl font-semibold mb-4">User Settings</h2>

        <section className="mb-6">
          <h3 className="text-lg font-medium mb-2">Profile</h3>
          <p className="text-sm">Email: {user.email}</p>
          <p className="text-sm">Name: {user.fullName}</p>
          <p className="text-sm">Subscription: {user.subscription}</p>
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
