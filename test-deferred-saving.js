// Simple test script to verify the deferred saving approach
// Run this in the browser console to test the behavior

console.log("Testing deferred conversation saving...");

// Add event listener to monitor localStorage changes
let localStorageWrites = [];
const originalSetItem = Storage.prototype.setItem;
Storage.prototype.setItem = function (key, value) {
  if (key === "openrouter-chat-history") {
    localStorageWrites.push({
      timestamp: new Date().toISOString(),
      operation: "setItem",
      key,
      value: JSON.parse(value),
    });
    console.log(
      `🔍 localStorage write #${localStorageWrites.length}:`,
      JSON.parse(value)
    );
  }
  return originalSetItem.apply(this, arguments);
};

// Clear any existing data
localStorage.removeItem("openrouter-chat-history");
localStorageWrites = [];

console.log(
  "✅ Test setup complete. Now send a message in the chat interface."
);
console.log("Expected behavior:");
console.log("- User message appears immediately in UI");
console.log("- NO localStorage write until API response completes");
console.log(
  "- After API response: SINGLE localStorage write with both messages"
);
console.log("");
console.log("To view results, run: localStorageWrites");
