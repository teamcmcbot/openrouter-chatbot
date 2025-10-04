/**
 * Tests for ImageGenerationStarters component
 * 
 * Verifies category switching, prompt selection callbacks,
 * and responsive layout behavior matching the chat starter design.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import ImageGenerationStarters from '../../../components/chat/ImageGenerationStarters';
import { IMAGE_GENERATION_CATEGORIES } from '../../../lib/constants/imageGenerationPrompts';

describe('ImageGenerationStarters', () => {
  const mockOnSelectPrompt = jest.fn();

  beforeEach(() => {
    mockOnSelectPrompt.mockClear();
  });

  it('renders all category buttons', () => {
    render(<ImageGenerationStarters onSelectPrompt={mockOnSelectPrompt} />);
    
    IMAGE_GENERATION_CATEGORIES.forEach(category => {
      expect(screen.getByRole('button', { name: `Select ${category.name} category` })).toBeInTheDocument();
    });
  });

  it('displays first category prompts by default', () => {
    render(<ImageGenerationStarters onSelectPrompt={mockOnSelectPrompt} />);
    
    const firstCategory = IMAGE_GENERATION_CATEGORIES[0];
    firstCategory.prompts.forEach(prompt => {
      expect(screen.getByText(prompt.buttonText)).toBeInTheDocument();
    });
  });

  it('switches categories when category button is clicked', () => {
    render(<ImageGenerationStarters onSelectPrompt={mockOnSelectPrompt} />);
    
    // Click on second category (Digital Art)
    const digitalArtButton = screen.getByRole('button', { name: 'Select Digital Art category' });
    fireEvent.click(digitalArtButton);
    
    // Check that Digital Art prompts are displayed
    const digitalArtCategory = IMAGE_GENERATION_CATEGORIES.find(cat => cat.name === 'Digital Art');
    if (digitalArtCategory) {
      digitalArtCategory.prompts.forEach(prompt => {
        expect(screen.getByText(prompt.buttonText)).toBeInTheDocument();
      });
    }
  });

  it('calls onSelectPrompt with full prompt text when prompt button is clicked', () => {
    render(<ImageGenerationStarters onSelectPrompt={mockOnSelectPrompt} />);
    
    const firstCategory = IMAGE_GENERATION_CATEGORIES[0];
    const firstPrompt = firstCategory.prompts[0];
    
    // Click the first prompt button
    const promptButton = screen.getByText(firstPrompt.buttonText);
    fireEvent.click(promptButton);
    
    expect(mockOnSelectPrompt).toHaveBeenCalledTimes(1);
    expect(mockOnSelectPrompt).toHaveBeenCalledWith(firstPrompt.fullPrompt);
  });

  it('displays correct number of category buttons', () => {
    render(<ImageGenerationStarters onSelectPrompt={mockOnSelectPrompt} />);
    
    const categoryButtons = screen.getAllByRole('button').filter(button => 
      button.getAttribute('aria-label')?.includes('Select') && 
      button.getAttribute('aria-label')?.includes('category')
    );
    
    expect(categoryButtons).toHaveLength(IMAGE_GENERATION_CATEGORIES.length);
  });

  it('displays correct number of prompt buttons for active category', () => {
    render(<ImageGenerationStarters onSelectPrompt={mockOnSelectPrompt} />);
    
    const firstCategory = IMAGE_GENERATION_CATEGORIES[0];
    const promptButtons = screen.getAllByRole('button').filter(button => 
      button.getAttribute('aria-label')?.includes('Use prompt:')
    );
    
    expect(promptButtons).toHaveLength(firstCategory.prompts.length);
  });

  it('updates prompt buttons when switching categories', () => {
    render(<ImageGenerationStarters onSelectPrompt={mockOnSelectPrompt} />);
    
    // Get initial prompt count
    const firstCategory = IMAGE_GENERATION_CATEGORIES[0];
    let promptButtons = screen.getAllByRole('button').filter(button => 
      button.getAttribute('aria-label')?.includes('Use prompt:')
    );
    expect(promptButtons).toHaveLength(firstCategory.prompts.length);
    
    // Switch to third category (Photo Real)
    const photoRealButton = screen.getByRole('button', { name: 'Select Photo Real category' });
    fireEvent.click(photoRealButton);
    
    // Check updated prompt count
    const thirdCategory = IMAGE_GENERATION_CATEGORIES[2]; // Photo Real
    promptButtons = screen.getAllByRole('button').filter(button => 
      button.getAttribute('aria-label')?.includes('Use prompt:')
    );
    expect(promptButtons).toHaveLength(thirdCategory.prompts.length);
  });

  it('applies active state to selected category button', () => {
    render(<ImageGenerationStarters onSelectPrompt={mockOnSelectPrompt} />);
    
    const firstCategoryButton = screen.getByRole('button', { name: `Select ${IMAGE_GENERATION_CATEGORIES[0].name} category` });
    expect(firstCategoryButton).toHaveAttribute('aria-pressed', 'true');
    
    // Click second category
    const secondCategoryButton = screen.getByRole('button', { name: `Select ${IMAGE_GENERATION_CATEGORIES[1].name} category` });
    fireEvent.click(secondCategoryButton);
    
    // Check that second category is now active
    expect(secondCategoryButton).toHaveAttribute('aria-pressed', 'true');
    expect(firstCategoryButton).toHaveAttribute('aria-pressed', 'false');
  });

  it('handles multiple prompt selections', () => {
    render(<ImageGenerationStarters onSelectPrompt={mockOnSelectPrompt} />);
    
    const firstCategory = IMAGE_GENERATION_CATEGORIES[0];
    
    // Click first prompt
    fireEvent.click(screen.getByText(firstCategory.prompts[0].buttonText));
    expect(mockOnSelectPrompt).toHaveBeenCalledWith(firstCategory.prompts[0].fullPrompt);
    
    // Click second prompt
    fireEvent.click(screen.getByText(firstCategory.prompts[1].buttonText));
    expect(mockOnSelectPrompt).toHaveBeenCalledWith(firstCategory.prompts[1].fullPrompt);
    
    expect(mockOnSelectPrompt).toHaveBeenCalledTimes(2);
  });

  it('accepts custom className prop', () => {
    const { container } = render(
      <ImageGenerationStarters 
        onSelectPrompt={mockOnSelectPrompt} 
        className="custom-class" 
      />
    );
    
    const wrapper = container.querySelector('.custom-class');
    expect(wrapper).toBeInTheDocument();
  });
});
