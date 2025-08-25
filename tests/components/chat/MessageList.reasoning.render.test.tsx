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
        reasoning_details: [{ type: 'reasoning.text', text: 'Detailed thinking process' }],
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
    // Details summary exists (for non-empty array)
    expect(screen.getByText('Technical Details')).toBeInTheDocument();
  });

  it('renders reasoning without details section when reasoning_details is empty', () => {
    const messages: ChatMessage[] = [
      {
        ...baseAssistant,
        id: 'm2',
        reasoning: 'Model thinking here',
        reasoning_details: [],
      },
    ];

    render(
      <MessageList
        messages={messages}
        isLoading={false}
      />
    );

    // Expand reasoning
    const button = screen.getByRole('button', { name: /reasoning/i });
    fireEvent.click(button);

    // Content appears but no Details section
    expect(screen.getByText('Model thinking here')).toBeInTheDocument();
    expect(screen.queryByText('Technical Details')).not.toBeInTheDocument();
  });

  it('does not render reasoning section when both reasoning and reasoning_details are empty', () => {
    const messages: ChatMessage[] = [
      {
        ...baseAssistant,
        id: 'm3',
        reasoning: undefined,
        reasoning_details: [],
      },
    ];

    render(
      <MessageList
        messages={messages}
        isLoading={false}
      />
    );

    // No reasoning section should appear
    expect(screen.queryByRole('button', { name: /reasoning/i })).not.toBeInTheDocument();
  });
});
