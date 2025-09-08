import { render, screen } from '@testing-library/react';
import MessageList from '../../components/chat/MessageList';
import { ChatMessage } from '../../lib/types/chat';

// Mock Next.js Image component
jest.mock('next/image', () => {
  return function MockImage({ src, alt }: { src: string; alt: string }) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} />;
  };
});

// Mock auth store
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: jest.fn().mockReturnValue(null),
}));

// Mock InlineAttachment components
jest.mock('../../components/chat/InlineAttachment', () => {
  return function MockInlineAttachment({ id, alt }: { id: string; alt?: string }) {
    return <div data-testid={`inline-attachment-${id}`}>{alt || 'Attachment'}</div>;
  };
});

jest.mock('../../components/chat/InlineAttachmentFull', () => {
  return function MockInlineAttachmentFull({ id, alt }: { id: string; alt?: string }) {
    return <div data-testid={`inline-attachment-full-${id}`}>{alt || 'Attachment Full'}</div>;
  };
});

describe('MessageList Consistent Image Rendering', () => {
  describe('Single image scenarios', () => {
    it('renders single output image full-width', () => {
      const message: ChatMessage = {
        id: 'msg-1',
        role: 'assistant',
        content: 'Here is your image',
        timestamp: new Date(),
        contentType: 'markdown',
        output_images: ['data:image/png;base64,AAAABBBB'],
      };

      render(<MessageList messages={[message]} isLoading={false} />);

      // Should show single output image container
      expect(screen.getByTestId('assistant-output-image-single')).toBeInTheDocument();
      // Should NOT show grid or attachment containers
      expect(screen.queryByTestId('assistant-output-images')).not.toBeInTheDocument();
      expect(screen.queryByTestId('assistant-attachment-single')).not.toBeInTheDocument();
      expect(screen.queryByTestId('assistant-attachments-grid')).not.toBeInTheDocument();
    });

    it('renders single attachment full-width', () => {
      const message: ChatMessage = {
        id: 'msg-2',
        role: 'user',
        content: 'Check this image',
        timestamp: new Date(),
        contentType: 'markdown',
        has_attachments: true,
        attachment_ids: ['att-123'],
      };

      render(<MessageList messages={[message]} isLoading={false} />);

      // Should show single attachment container
      expect(screen.getByTestId('assistant-attachment-single')).toBeInTheDocument();
      // Should show the InlineAttachmentFull component
      expect(screen.getByTestId('inline-attachment-full-att-123')).toBeInTheDocument();
      // Should NOT show other containers
      expect(screen.queryByTestId('assistant-output-image-single')).not.toBeInTheDocument();
      expect(screen.queryByTestId('assistant-output-images')).not.toBeInTheDocument();
      expect(screen.queryByTestId('assistant-attachments-grid')).not.toBeInTheDocument();
    });
  });

  describe('Multiple images scenarios', () => {
    it('renders multiple output images as grid with responsive sizing', () => {
      const message: ChatMessage = {
        id: 'msg-3',
        role: 'assistant',
        content: 'Multiple images',
        timestamp: new Date(),
        contentType: 'markdown',
        output_images: ['data:image/png;base64,IMG1', 'data:image/png;base64,IMG2'],
      };

      render(<MessageList messages={[message]} isLoading={false} />);

      // Should show output images grid
      expect(screen.getByTestId('assistant-output-images')).toBeInTheDocument();
      // Should have 2 image buttons with responsive classes
      const grid = screen.getByTestId('assistant-output-images');
      const buttons = grid.querySelectorAll('button');
      expect(buttons).toHaveLength(2);
      
      // Check for responsive sizing classes
      buttons.forEach(button => {
        expect(button.className).toContain('w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28');
      });
      
      // Should NOT show single containers
      expect(screen.queryByTestId('assistant-output-image-single')).not.toBeInTheDocument();
      expect(screen.queryByTestId('assistant-attachment-single')).not.toBeInTheDocument();
    });

    it('renders multiple attachments as grid', () => {
      const message: ChatMessage = {
        id: 'msg-4',
        role: 'user',
        content: 'Multiple attachments',
        timestamp: new Date(),
        contentType: 'markdown',
        has_attachments: true,
        attachment_ids: ['att-1', 'att-2', 'att-3'],
      };

      render(<MessageList messages={[message]} isLoading={false} />);

      // Should show attachments grid
      expect(screen.getByTestId('assistant-attachments-grid')).toBeInTheDocument();
      // Should show InlineAttachment components
      expect(screen.getByTestId('inline-attachment-att-1')).toBeInTheDocument();
      expect(screen.getByTestId('inline-attachment-att-2')).toBeInTheDocument();
      expect(screen.getByTestId('inline-attachment-att-3')).toBeInTheDocument();
      // Should NOT show single containers
      expect(screen.queryByTestId('assistant-output-image-single')).not.toBeInTheDocument();
      expect(screen.queryByTestId('assistant-attachment-single')).not.toBeInTheDocument();
    });
  });

  describe('Mixed images scenarios', () => {
    it('renders mixed output images and attachments as grid when total > 1', () => {
      const message: ChatMessage = {
        id: 'msg-5',
        role: 'assistant',
        content: 'Mixed images',
        timestamp: new Date(),
        contentType: 'markdown',
        output_images: ['data:image/png;base64,OUTPUT1'],
        has_attachments: true,
        attachment_ids: ['att-mixed'],
      };

      render(<MessageList messages={[message]} isLoading={false} />);

      // Should show output images grid (since there's at least one output image)
      expect(screen.getByTestId('assistant-output-images')).toBeInTheDocument();
      // Should have 1 output image button
      const grid = screen.getByTestId('assistant-output-images');
      expect(grid.querySelectorAll('button')).toHaveLength(1);
      // Should also show the attachment
      expect(screen.getByTestId('inline-attachment-att-mixed')).toBeInTheDocument();
      // Should NOT show single containers
      expect(screen.queryByTestId('assistant-output-image-single')).not.toBeInTheDocument();
      expect(screen.queryByTestId('assistant-attachment-single')).not.toBeInTheDocument();
    });
  });

  describe('No images scenarios', () => {
    it('renders no image containers when no images present', () => {
      const message: ChatMessage = {
        id: 'msg-6',
        role: 'assistant',
        content: 'Just text',
        timestamp: new Date(),
        contentType: 'markdown',
      };

      render(<MessageList messages={[message]} isLoading={false} />);

      // Should not show any image containers
      expect(screen.queryByTestId('assistant-output-image-single')).not.toBeInTheDocument();
      expect(screen.queryByTestId('assistant-attachment-single')).not.toBeInTheDocument();
      expect(screen.queryByTestId('assistant-output-images')).not.toBeInTheDocument();
      expect(screen.queryByTestId('assistant-attachments-grid')).not.toBeInTheDocument();
    });
  });
});
