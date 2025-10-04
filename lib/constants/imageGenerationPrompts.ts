/**
 * Image Generation Helper Prompts
 * 
 * Curated prompts to guide users in creating effective image generation requests.
 * Organized by artistic style categories with mobile-friendly button text.
 */

export interface PromptItem {
  /** Short text for button display (mobile-friendly) */
  buttonText: string;
  /** Full prompt text to be inserted into message input */
  fullPrompt: string;
}

export interface CategoryData {
  /** Unique category identifier */
  id: string;
  /** Display name for category */
  name: string;
  /** TailwindCSS color classes for category styling */
  color: string;
  /** Array of prompt items in this category */
  prompts: PromptItem[];
}

export const IMAGE_GENERATION_CATEGORIES: CategoryData[] = [
  {
    id: 'classic-art',
    name: 'Classic Art',
    color: 'purple',
    prompts: [
      {
        buttonText: 'Oil painting portrait',
        fullPrompt: 'A classical oil painting portrait in the style of Renaissance masters, with rich colors, dramatic chiaroscuro lighting, and fine brushwork details'
      },
      {
        buttonText: 'Watercolor landscape',
        fullPrompt: 'A serene watercolor landscape with soft brushstrokes and delicate color transitions, featuring rolling hills at golden hour with atmospheric perspective'
      },
      {
        buttonText: 'Impressionist garden',
        fullPrompt: 'An impressionist garden scene with loose brushwork, vibrant dappled light, and bold color harmonies in the style of Claude Monet'
      },
      {
        buttonText: 'Art deco poster',
        fullPrompt: 'An Art Deco travel poster with geometric shapes, elegant typography, bold colors, and streamlined forms characteristic of the 1920s'
      }
    ]
  },
  {
    id: 'digital-art',
    name: 'Digital Art',
    color: 'blue',
    prompts: [
      {
        buttonText: 'Anime character',
        fullPrompt: 'An anime-style character design with vibrant colors, expressive large eyes, dynamic pose, detailed hair, and modern urban background'
      },
      {
        buttonText: 'Pixel art scene',
        fullPrompt: 'A charming pixel art scene with 16-bit style graphics, limited color palette, crisp edges, and nostalgic retro gaming aesthetic'
      },
      {
        buttonText: '3D render concept',
        fullPrompt: 'A high-quality 3D rendered concept with clean topology, realistic materials, dramatic studio lighting, and professional product visualization'
      },
      {
        buttonText: 'Vector illustration',
        fullPrompt: 'A modern vector illustration with flat design, bold geometric shapes, harmonious color scheme, and clean minimalist composition'
      }
    ]
  },
  {
    id: 'photo-real',
    name: 'Photo Real',
    color: 'green',
    prompts: [
      {
        buttonText: 'Professional portrait',
        fullPrompt: 'A professional corporate headshot with natural studio lighting, neutral background, confident expression, sharp focus, and commercial photography quality'
      },
      {
        buttonText: 'Product photography',
        fullPrompt: 'High-end product photography with studio lighting, white background, perfect focus, professional color grading, and commercial appeal'
      },
      {
        buttonText: 'Landscape photography',
        fullPrompt: 'Stunning landscape photography with golden hour lighting, dramatic clouds, perfect composition, rich colors, and professional post-processing'
      },
      {
        buttonText: 'Architectural shot',
        fullPrompt: 'Professional architectural photography showcasing modern design with clean lines, dramatic angles, natural lighting, and urban context'
      }
    ]
  },
  {
    id: 'fantasy',
    name: 'Fantasy',
    color: 'pink',
    prompts: [
      {
        buttonText: 'Epic fantasy scene',
        fullPrompt: 'An epic fantasy landscape with magical elements, ancient ruins, mystical lighting, floating islands, and otherworldly atmosphere'
      },
      {
        buttonText: 'Sci-fi concept',
        fullPrompt: 'Futuristic sci-fi concept art featuring advanced technology, neon lights, cyberpunk aesthetics, dramatic composition, and cinematic atmosphere'
      },
      {
        buttonText: 'Surreal dreamscape',
        fullPrompt: 'A surreal dreamscape blending impossible architecture, floating objects, vivid colors, melting forms, and ethereal Salvador Dalí-inspired atmosphere'
      },
      {
        buttonText: 'Mythical creature',
        fullPrompt: 'A majestic mythical creature design combining various animal features, magical elements, intricate details, and epic fantasy art style'
      }
    ]
  }
];

/**
 * Get category by ID
 */
export function getCategoryById(categoryId: string): CategoryData | undefined {
  return IMAGE_GENERATION_CATEGORIES.find(cat => cat.id === categoryId);
}

/**
 * Get all prompts across all categories (useful for search/filtering)
 */
export function getAllPrompts(): Array<PromptItem & { categoryId: string; categoryName: string }> {
  return IMAGE_GENERATION_CATEGORIES.flatMap(category =>
    category.prompts.map(prompt => ({
      ...prompt,
      categoryId: category.id,
      categoryName: category.name
    }))
  );
}
