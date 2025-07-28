// scripts/test-admin-sync.js
// Simple test script for the Admin Model Sync API

/**
 * Test script for Admin Model Sync API
 *
 * Prerequisites:
 * 1. Sign in to your app via Supabase
 * 2. Set your subscription_tier to 'enterprise' in the database
 * 3. Run this script in the browser console
 */

class AdminSyncTester {
  constructor() {
    this.baseUrl = window.location.origin;
    this.token = null;
  }

  // Get JWT token from localStorage
  getToken() {
    try {
      console.log("🔍 Searching for JWT token in localStorage...");

      // First, let's see what keys are available
      const allKeys = [];
      for (let i = 0; i < localStorage.length; i++) {
        allKeys.push(localStorage.key(i));
      }
      console.log("📋 Available localStorage keys:", allKeys);

      // Try different possible localStorage keys for Supabase
      const possibleKeys = [
        "sb-localhost-auth-token",
        "sb-auth-token",
        "supabase.auth.token",
        // Add more specific patterns
        `sb-${window.location.hostname.replace(/\./g, "-")}-auth-token`,
        `sb-${window.location.host
          .replace(/\./g, "-")
          .replace(/:/g, "-")}-auth-token`,
      ];

      console.log("🎯 Trying specific keys:", possibleKeys);

      for (const key of possibleKeys) {
        const stored = localStorage.getItem(key);
        if (stored) {
          console.log(`🔍 Found data in key: ${key}`);
          try {
            const session = JSON.parse(stored);
            console.log("📄 Session structure:", Object.keys(session));

            if (session.access_token) {
              this.token = session.access_token;
              console.log("✅ Found JWT token in access_token");
              return this.token;
            }

            // Try nested structures
            if (session.session && session.session.access_token) {
              this.token = session.session.access_token;
              console.log("✅ Found JWT token in session.access_token");
              return this.token;
            }

            if (session.user && session.access_token) {
              this.token = session.access_token;
              console.log("✅ Found JWT token with user data");
              return this.token;
            }
          } catch (parseError) {
            console.log(
              `❌ Failed to parse JSON for key ${key}:`,
              parseError.message
            );
          }
        }
      }

      // Fallback: try to find any key containing 'auth' or 'sb-'
      console.log("🔄 Fallback: searching all auth-related keys...");
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes("auth") || key.includes("sb-"))) {
          console.log(`🔍 Checking fallback key: ${key}`);
          try {
            const stored = localStorage.getItem(key);
            const session = JSON.parse(stored);

            // Check various possible token locations
            const tokenPaths = [
              session.access_token,
              session.session?.access_token,
              session.user?.access_token,
              session.token,
              session.jwt,
            ];

            for (const token of tokenPaths) {
              if (token && typeof token === "string" && token.length > 50) {
                this.token = token;
                console.log(`✅ Found JWT token in key: ${key}`);
                return this.token;
              }
            }
          } catch {
            // Continue searching
          }
        }
      }

      // If still no token, provide helpful debugging info
      console.log("❌ No JWT token found. Debugging info:");
      console.log("🔍 All localStorage keys:", allKeys);
      console.log("💡 Make sure you are signed in to the app");
      console.log("💡 Try refreshing the page after signing in");

      throw new Error("No JWT token found. Please sign in first.");
    } catch (error) {
      console.error("❌ Error getting token:", error.message);
      return null;
    }
  }

  // Test GET endpoint (sync status)
  async testGetStatus() {
    console.log("\n🔍 Testing GET /api/admin/sync-models (sync status)...");

    try {
      const response = await fetch(`${this.baseUrl}/api/admin/sync-models`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // Include cookies for authentication
      });

      const data = await response.json();

      if (response.ok) {
        console.log("✅ GET Status Success:", data);
        return data;
      } else {
        console.log("❌ GET Status Error:", response.status, data);
        this.handleErrorResponse(response.status, data);
        return null;
      }
    } catch (error) {
      console.error("❌ GET Status Network Error:", error);
      return null;
    }
  }

  // Test POST endpoint (trigger sync)
  async testPostSync() {
    console.log("\n🚀 Testing POST /api/admin/sync-models (trigger sync)...");

    try {
      const response = await fetch(`${this.baseUrl}/api/admin/sync-models`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // Include cookies for authentication
      });

      const data = await response.json();

      if (response.ok) {
        console.log("✅ POST Sync Success:", data);
        return data;
      } else {
        console.log("❌ POST Sync Error:", response.status, data);
        this.handleErrorResponse(response.status, data);
        return null;
      }
    } catch (error) {
      console.error("❌ POST Sync Network Error:", error);
      return null;
    }
  }

  // Handle error responses with helpful tips
  handleErrorResponse(status, data) {
    if (status === 401) {
      console.log("💡 Tip: Make sure you are signed in to the app");
      console.log("💡 Try refreshing the page and signing in again");
    } else if (status === 403) {
      console.log(
        '💡 Tip: Make sure your subscription_tier is set to "enterprise"'
      );
      console.log(
        "💡 Run this SQL: UPDATE profiles SET subscription_tier = 'enterprise' WHERE email = 'your-email@example.com';"
      );
    } else if (status === 429) {
      console.log("💡 Tip: Wait for the cooldown period to expire");
      if (data.retryAfter) {
        console.log(`💡 Retry after: ${data.retryAfter} seconds`);
      }
    } else if (status === 409) {
      console.log(
        "💡 Tip: Another sync is already running, wait for it to complete"
      );
    }
  }

  // Run all tests
  async runAllTests() {
    console.log("🧪 Starting Admin Sync API Tests...");
    console.log("Base URL:", this.baseUrl);
    console.log("🔐 Using cookie-based authentication (same as /api/chat)");

    // Test 1: Get sync status
    const statusResult = await this.testGetStatus();

    // Test 2: Trigger sync (only if status test passed)
    if (statusResult) {
      await this.testPostSync();
    }

    console.log("\n✨ Tests completed!");
  }

  // Check prerequisites
  checkPrerequisites() {
    console.log("🔍 Checking prerequisites...");

    // Check if we're on the right domain
    if (
      !window.location.origin.includes("localhost") &&
      !window.location.origin.includes("vercel")
    ) {
      console.warn("⚠️  Make sure you're running this on your app domain");
    }

    console.log("💡 Make sure you are signed in to the app");
    console.log("💡 Authentication is handled via cookies automatically");
    console.log("✅ Prerequisites check completed");
    return true;
  }
}

// Auto-run when script is loaded
console.log("🔧 Admin Sync API Tester loaded");
console.log("📖 Usage:");
console.log("  const tester = new AdminSyncTester();");
console.log("  tester.checkPrerequisites();");
console.log("  tester.runAllTests();");
console.log("");
console.log("� Quick start:");
console.log("  const tester = new AdminSyncTester();");
console.log("  tester.runAllTests();");

// Create global instance for easy access
window.adminSyncTester = new AdminSyncTester();

// Export for module usage
if (typeof module !== "undefined" && module.exports) {
  module.exports = AdminSyncTester;
}
