// src/app/admin/page.tsx
import Link from 'next/link';
import React from 'react';
import { createClient } from '../../../lib/supabase/server';
import ModelsPanel from '@/app/admin/ModelsPanel';
import UsersPanel from '@/app/admin/UsersPanel';
import AnalyticsPanel from '@/app/admin/AnalyticsPanel';
import ClientTabs from '@/app/admin/tabs';

async function fetchProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, full_name, account_type, subscription_tier')
    .eq('id', user.id)
    .single();
  return profile as { id: string; email: string; full_name?: string | null; account_type?: 'user'|'admin'; subscription_tier: 'free'|'pro'|'enterprise' } | null;
}

export default async function AdminPage() {
  // Server-side guard
  const profile = await fetchProfile();
  if (!profile || profile.account_type !== 'admin') {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Access denied</h1>
        <p className="mt-2 text-sm text-gray-600">Admin access required.</p>
        <div className="mt-4">
          <Link className="text-blue-600 underline" href="/">Go back</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <p className="text-sm text-gray-600">Welcome, {profile.full_name || profile.email}</p>
      </header>
      <ClientTabs
        tabs={[
          { id: 'models', label: 'Models', content: <ModelsPanel /> },
          { id: 'users', label: 'Users', content: <UsersPanel /> },
          { id: 'analytics', label: 'Analytics', content: <AnalyticsPanel /> },
        ]}
        defaultTab="models"
      />
    </div>
  );
}
 
