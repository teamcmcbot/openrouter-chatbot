import { useChatStore, useChat } from '../../stores';

// Simple test to see if imports work
describe('Test imports', () => {
  it('should import successfully', () => {
    expect(useChatStore).toBeDefined();
    expect(useChat).toBeDefined();
  });
});
