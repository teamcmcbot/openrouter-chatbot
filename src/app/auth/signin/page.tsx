"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Button from "../../../../components/ui/Button";
import { useAuth } from "../../../../stores/useAuthStore";
import { getSafeReturnTo } from "../../../../lib/utils/returnTo";

async function setReturnCookie(returnTo: string | null) {
  try {
    await fetch("/api/auth/set-return-cookie", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ returnTo }),
      cache: "no-store",
    });
  } catch {}
}

function SignInInner() {
  const search = useSearchParams();
  const router = useRouter();
  const { isLoading, isAuthenticated } = useAuth();
  const [seconds, setSeconds] = useState(5);
  const [autoRedirect, setAutoRedirect] = useState(true);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const target = useMemo(() => {
    const raw = search?.get("returnTo") ?? null;
    const safe = getSafeReturnTo(raw);
    // Edge case: root should fall back to /chat per spec
    if (safe === "/") return null;
    return safe;
  }, [search]);

  useEffect(() => {
    // If already signed in, bounce to target or default
    if (isAuthenticated) {
      router.replace(target || "/chat");
      return;
    }
    // Set fallback cookie so OAuth round-trip can restore intent
    setReturnCookie(target).catch(() => {});
  }, [isAuthenticated, router, target]);

  const handleGoogle = useCallback(async () => {
    // Include returnTo in redirectTo query so callback can read it
    const rt = target ? encodeURIComponent(target) : "";
    const redirectTo = `${window.location.origin}/auth/callback${rt ? `?returnTo=${rt}` : ""}`;
    // Kick off OAuth via Supabase with custom redirectTo
    try {
      // We can't pass redirectTo through existing store function; call Supabase directly
      const { createClient } = await import("../../../../lib/supabase/client");
      const supabase = createClient();
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
    } catch {
      // no-op; UI button shows loading via store state in other flows
    }
  }, [target]);

  const handleCancel = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setAutoRedirect(false);
    router.back();
  }, [router]);

  // Start/stop countdown timer
  useEffect(() => {
    // Clear any existing timer first
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (!autoRedirect || isAuthenticated) return;
    // Reset when starting
    setSeconds((s) => (s <= 0 || s > 5 ? 5 : s));
    timerRef.current = setInterval(() => {
      setSeconds((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [autoRedirect, isAuthenticated]);

  // Trigger redirect when countdown hits 0
  useEffect(() => {
    if (!autoRedirect || isAuthenticated) return;
    if (seconds <= 0) {
      // Stop timer to avoid duplicate calls
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      void handleGoogle();
    }
  }, [seconds, autoRedirect, isAuthenticated, handleGoogle]);

  return (
    <div className="min-h-[var(--mobile-content-height)] sm:min-h-[var(--desktop-content-height)] flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <div className="w-full max-w-xl sm:max-w-2xl">
        <div className="bg-white/90 dark:bg-gray-800/80 backdrop-blur rounded-2xl shadow-md border border-gray-200/60 dark:border-gray-700 p-6 sm:p-10">
          <div className="text-center">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-gray-900 dark:text-white">
              Sign in
            </h1>
            <p className="mt-3 text-sm sm:text-base text-gray-700 dark:text-gray-300">
              {autoRedirect ? (
                <>
                  Redirecting to Google in <span className="font-semibold">{seconds}s</span>…
                  <br className="hidden sm:block" />
                  You will be returned to <span className="font-mono text-gray-900 dark:text-gray-100">{target || "/chat"}</span> after signing in.
                </>
              ) : (
                <>Redirect canceled. Click Cancel to return to your previous page.</>
              )}
            </p>
          </div>

          <div className="mt-8 space-y-3">
            <Button onClick={handleGoogle} loading={isLoading} className="w-full">
              Continue with Google
            </Button>
            <div className="text-center text-xs sm:text-sm text-gray-500 dark:text-gray-400">
              {autoRedirect && (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="underline hover:text-gray-700 dark:hover:text-gray-300"
                >
                  Cancel &amp; Go Back
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading…</div>}>
      <SignInInner />
    </Suspense>
  );
}
