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

describe('Responsive output images layout', () => {
  it('single image does not have w-full class and uses max-w-full', () => {
    const msg: ChatMessage = {
      id: 'one',
      role: 'assistant',
      content: 'single',
      timestamp: new Date(),
      contentType: 'markdown',
      output_images: ['data:image/png;base64,ONE'],
    };
    render(<MessageList messages={[msg]} isLoading={false} />);
    const container = screen.getByTestId('assistant-output-image-single');
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    const classList = img!.className.split(/\s+/);
    expect(classList).toContain('max-w-full');
    expect(classList).not.toContain('w-full');
  });

  it('multi-image thumbnails use responsive size classes', () => {
    const msg: ChatMessage = {
      id: 'multi',
      role: 'assistant',
      content: 'multi',
      timestamp: new Date(),
      contentType: 'markdown',
      output_images: ['data:image/png;base64,A', 'data:image/png;base64,B', 'data:image/png;base64,C'],
    };
    render(<MessageList messages={[msg]} isLoading={false} />);
    const grid = screen.getByTestId('assistant-output-images');
    const firstBtn = grid.querySelector('button');
    expect(firstBtn).not.toBeNull();
    const btnClass = firstBtn!.className;
    expect(btnClass).toMatch(/w-20/);
    expect(btnClass).toMatch(/sm:w-24/);
    expect(btnClass).toMatch(/md:w-28/);
  });
});
