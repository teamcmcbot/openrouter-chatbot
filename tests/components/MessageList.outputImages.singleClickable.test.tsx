import { fireEvent, render, screen } from '@testing-library/react';
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

describe('Single output image click behavior', () => {
  it('opens lightbox when single inline image clicked', () => {
    const assistantMessage: ChatMessage = {
      id: 'assist-click',
      role: 'assistant',
      content: 'Image below',
      timestamp: new Date(),
      contentType: 'markdown',
      output_images: ['data:image/png;base64,CLICKME'],
    };

    render(<MessageList messages={[assistantMessage]} isLoading={false} />);

    const container = screen.getByTestId('assistant-output-image-single');
    const button = container.querySelector('button');
    expect(button).not.toBeNull();
    fireEvent.click(button!);

    // Lightbox should render Next.js Image (mocked) inside dialog role region
    const openBadge = screen.getByText('Open'); // still present
    expect(openBadge).toBeInTheDocument();
    // Check that lightbox overlay exists (by alt text reused in lightbox)
    const expanded = screen.getAllByAltText('Generated image');
    expect(expanded.length).toBeGreaterThan(1); // one in inline, one in lightbox
  });
});
