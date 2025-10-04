/**
 * ImageGenerationStarters Component
 * 
 * Displays curated helper prompts to guide users in creating effective
 * image generation requests. Shows style-focused categories with
 * mobile-responsive layout matching the chat starter design.
 */

'use client';

import { useState } from 'react';
import { IMAGE_GENERATION_CATEGORIES } from '../../lib/constants/imageGenerationPrompts';

interface ImageGenerationStartersProps {
  /** Callback when user selects a prompt */
  onSelectPrompt: (promptText: string) => void;
  /** Optional className for custom styling */
  className?: string;
}

// Category icons matching the design style
const categoryIcons = {
  'classic-art': (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
    </svg>
  ),
  'digital-art': (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  'photo-real': (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  'fantasy': (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  )
};

export default function ImageGenerationStarters({
  onSelectPrompt,
  className = ''
}: ImageGenerationStartersProps) {
  const [activeCategory, setActiveCategory] = useState<string>(IMAGE_GENERATION_CATEGORIES[0].id);

  const activeCategoryData = IMAGE_GENERATION_CATEGORIES.find(
    cat => cat.id === activeCategory
  ) || IMAGE_GENERATION_CATEGORIES[0];

  return (
    <div className={`w-full max-w-2xl mx-auto px-4 py-4 ${className}`}>
      {/* Category Buttons - Square with Icons (matching Code, Learn, Explore, Create style) */}
      <div className="grid grid-cols-4 gap-3 mb-6 max-w-md mx-auto">
        {IMAGE_GENERATION_CATEGORIES.map((category) => (
          <button
            key={category.id}
            onClick={() => setActiveCategory(category.id)}
            className={`aspect-square flex flex-col items-center justify-center p-3 rounded-2xl font-medium transition-all duration-200 max-w-[80px] ${
              activeCategory === category.id
                ? "bg-emerald-600 text-white shadow-lg"
                : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
            }`}
            aria-pressed={category.id === activeCategory}
            aria-label={`Select ${category.name} category`}
          >
            <div className="mb-1">
              {categoryIcons[category.id as keyof typeof categoryIcons]}
            </div>
            <span className="text-xs font-semibold text-center leading-tight">
              {category.name}
            </span>
          </button>
        ))}
      </div>

      {/* Prompt Grid - Compact (matching existing prompt style) */}
      <div className="grid grid-cols-1 gap-3 max-w-xl mx-auto">
        {activeCategoryData.prompts.map((prompt, index) => (
          <button
            key={`${activeCategoryData.id}-${index}`}
            onClick={() => onSelectPrompt(prompt.fullPrompt)}
            className="p-3 text-left bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-emerald-500 dark:hover:border-emerald-400 hover:shadow-md transition-all duration-200"
            aria-label={`Use prompt: ${prompt.buttonText}`}
          >
            <p className="text-gray-900 dark:text-gray-100 text-sm leading-relaxed">
              {prompt.buttonText}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}