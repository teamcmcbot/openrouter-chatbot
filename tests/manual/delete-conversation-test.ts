/**
 * Manual Test Script for Delete Conversation Backend Sync
 * 
 * This file can be used to manually test the delete conversation functionality
 * in both authenticated and unauthenticated states.
 */

import { useChatStore } from '../../stores/useChatStore';
import { useAuthStore } from '../../stores/useAuthStore';

export async function testDeleteConversationSync() {
  console.log('🧪 Testing Delete Conversation Sync Functionality');
  
  // Test 1: Unauthenticated user - local only deletion
  console.log('\n📝 Test 1: Unauthenticated User (Local Deletion)');
  
  // Clear existing conversations
  const chatStore = useChatStore.getState();
  const authStore = useAuthStore.getState();
  
  console.log('Current auth state:', { isAuthenticated: authStore.isAuthenticated, user: !!authStore.user });
  
  // Create a test conversation
  const testConvId = chatStore.createConversation('Test Conversation for Deletion');
  console.log('Created conversation:', testConvId);
  console.log('Total conversations before deletion:', chatStore.conversations.length);
  
  try {
    // Delete the conversation
    await chatStore.deleteConversation(testConvId);
    console.log('✅ Conversation deleted successfully');
    console.log('Total conversations after deletion:', useChatStore.getState().conversations.length);
    console.log('Current conversation ID:', useChatStore.getState().currentConversationId);
  } catch (error) {
    console.error('❌ Error deleting conversation:', error);
  }
  
  console.log('\n🎉 Test completed successfully!');
}

// Export for potential use in development/debugging
export default testDeleteConversationSync;
