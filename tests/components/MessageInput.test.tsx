import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import MessageInput from '../../components/chat/MessageInput';

describe('MessageInput', () => {
  it('renders message input', () => {
    const mockSendMessage = jest.fn();
    render(<MessageInput onSendMessage={mockSendMessage} />);
    
    const textarea = screen.getByPlaceholderText(/type your message/i);
    expect(textarea).toBeInTheDocument();
  });

  it('handles message submission', () => {
    const mockSendMessage = jest.fn();
    render(<MessageInput onSendMessage={mockSendMessage} />);
    
    const textarea = screen.getByPlaceholderText(/type your message/i);
    const sendButton = screen.getByRole('button', { name: /send message/i });
    
    fireEvent.change(textarea, { target: { value: 'Hello, world!' } });
    fireEvent.click(sendButton);
    
    expect(mockSendMessage).toHaveBeenCalledWith('Hello, world!', {"webSearch": false});
  });

  it('disables input when disabled prop is true', () => {
    const mockSendMessage = jest.fn();
    render(<MessageInput onSendMessage={mockSendMessage} disabled={true} />);
    
    const textarea = screen.getByPlaceholderText(/type your message/i);
    const sendButton = screen.getByRole('button', { name: /send message/i });
    
    expect(textarea).toBeDisabled();
    expect(sendButton).toBeDisabled();
  });
});
