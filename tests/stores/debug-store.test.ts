// Debug store behavior
import { useChatStore } from '../../stores/useChatStore';

describe('Debug Store State', () => {
  test('should debug store state updates', () => {
    console.log('=== DEBUGGING STORE STATE ===');
    
    // Reset store
    useChatStore.setState({
      conversations: [],
      currentConversationId: null,
      isLoading: false,
      error: null,
      isHydrated: true,
    });
    
    console.log('1. Initial state:', useChatStore.getState());
    
    // Create conversation
    const store = useChatStore.getState();
    const conversationId = store.createConversation('Debug Chat');
    
    console.log('2. After createConversation:', {
      conversationId,
      conversations: useChatStore.getState().conversations,
      currentConversationId: useChatStore.getState().currentConversationId
    });
    
    // Find the conversation
    const conversation = useChatStore.getState().conversations.find(c => c.isActive);
    console.log('3. Found active conversation:', conversation);
    
    if (conversation) {
      // Add messages
      const testMessages = [
        {
          id: 'msg1',
          content: 'Hello',
          role: 'user' as const,
          timestamp: new Date(),
        },
        {
          id: 'msg2',
          content: 'Hi there!',
          role: 'assistant' as const,
          timestamp: new Date(),
        },
        {
          id: 'current',
          content: 'Current message',
          role: 'user' as const,
          timestamp: new Date(),
        }
      ];
      
      // Update the conversation
      conversation.messages = testMessages;
      
      console.log('4. After adding messages:', {
        messageCount: conversation.messages.length,
        messages: conversation.messages.map(m => ({ id: m.id, role: m.role, content: m.content }))
      });
      
      // Test getContextMessages
      const contextMessages = store.getContextMessages(1000);
      console.log('5. Context selection result:', {
        contextCount: contextMessages.length,
        contextMessages: contextMessages.map(m => ({ id: m.id, role: m.role, content: m.content }))
      });
    }
  });
});
