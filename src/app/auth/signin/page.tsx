"use client";

import { Suspense, useEffect, useMemo } from "react";
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

  const handleGoogle = async () => {
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
  };

  return (
    <div className="min-h-full flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="max-w-md w-full space-y-8 p-8">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900 dark:text-white">
            Sign in
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Continue to manage your subscription and chats
          </p>
        </div>

        <div className="mt-8 space-y-4">
          <Button onClick={handleGoogle} loading={isLoading} className="w-full">
            Continue with Google
          </Button>
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            You will be returned to {target || "/chat"} after signing in.
          </p>
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
