"use client";

import { useMemo } from 'react';

// Lightweight utility to compute ban status from a user profile shape
export interface BanAwareProfile {
  is_banned?: boolean | null;
  banned_until?: string | null;
}

export function useBanStatus(profile: BanAwareProfile | null | undefined) {
  const { isBanned, isTempBanned } = useMemo(() => {
    const until = profile?.banned_until ? new Date(profile.banned_until).getTime() : 0;
    const isTemp = Boolean(profile?.banned_until) && until > Date.now();
    const isPermanent = Boolean(profile?.is_banned);
    return { isBanned: isPermanent || isTemp, isTempBanned: isTemp };
  }, [profile?.is_banned, profile?.banned_until]);

  return { isBanned, isTempBanned };
}
