import { render, screen } from '@testing-library/react';
import MessageList from '../../components/chat/MessageList';
import { ChatMessage } from '../../lib/types/chat';

jest.mock('next/image', () => {
  return function MockImage({ src, alt }: { src: string; alt: string }) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} />;
  };
});

jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: jest.fn().mockReturnValue(null),
}));

describe('MessageList single output image full render', () => {
  it('renders a single output image inline full-size container', () => {
    const assistantMessage: ChatMessage = {
      id: 'assist-1',
      role: 'assistant',
      content: 'Here is your image',
      timestamp: new Date(),
      contentType: 'markdown',
      output_images: ['data:image/png;base64,AAAABBBB'],
    };

    render(<MessageList messages={[assistantMessage]} isLoading={false} />);

    // Should not show the thumbnail grid test id, but show single image test id
    expect(screen.queryByTestId('assistant-output-images')).not.toBeInTheDocument();
    const single = screen.getByTestId('assistant-output-image-single');
    expect(single).toBeInTheDocument();
    // The img should be present
    const img = single.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('data:image/png;base64,AAAABBBB');
  });

  it('renders multiple images as grid (regression)', () => {
    const assistantMessage: ChatMessage = {
      id: 'assist-2',
      role: 'assistant',
      content: 'Multiple images',
      timestamp: new Date(),
      contentType: 'markdown',
      output_images: ['data:image/png;base64,IMG1', 'data:image/png;base64,IMG2'],
    };

    render(<MessageList messages={[assistantMessage]} isLoading={false} />);

    const grid = screen.getByTestId('assistant-output-images');
    expect(grid).toBeInTheDocument();
    // Two buttons (thumbnails)
    expect(grid.querySelectorAll('button')).toHaveLength(2);
  });
});
