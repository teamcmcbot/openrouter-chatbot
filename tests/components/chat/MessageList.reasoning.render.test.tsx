import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import MessageList from '../../../components/chat/MessageList';
import { ChatMessage } from '../../../lib/types/chat';

const baseAssistant: ChatMessage = {
  id: 'a1',
  role: 'assistant',
  content: 'Answer content',
  contentType: 'markdown',
  model: 'test-model',
  timestamp: new Date(),
};

describe('MessageList reasoning rendering', () => {
  it('renders collapsed Reasoning and toggles open', () => {
    const messages: ChatMessage[] = [
      {
        ...baseAssistant,
        id: 'm1',
        reasoning: 'Model thinking here',
        reasoning_details: { effort: 'low' },
      },
    ];

    render(
      <MessageList
        messages={messages}
        isLoading={false}
      />
    );

    // Button label exists
    const button = screen.getByRole('button', { name: /reasoning/i });
    expect(button).toBeInTheDocument();
    // Collapsed by default
    expect(button).toHaveAttribute('aria-expanded', 'false');

    // Expand
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');

    // Content appears
    expect(screen.getByText('Model thinking here')).toBeInTheDocument();
    // Details summary exists
    expect(screen.getByText('Details')).toBeInTheDocument();
  });
});
