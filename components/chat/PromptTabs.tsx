"use client";

import { useState } from "react";

interface PromptCategory {
  key: string;
  prompts: string[];
}

interface PromptTabsProps {
  onPromptSelect: (prompt: string) => void;
}

const promptCategories: PromptCategory[] = [
  {
    key: "Code",
    prompts: [
      "Write code to invert a binary search tree in Python",
      "What's the difference between Promise.all and Promise.allSettled?",
      "Explain React's useEffect cleanup function",
      "Best practices for error handling in async/await"
    ]
  },
  {
    key: "Learn",
    prompts: [
      "How does GPT-4 differ from GPT-3?",
      "What is the Turing Test?",
      "Explain the concept of overfitting in machine learning",
      "What is transfer learning in AI?"
    ]
  },
  {
    key: "Explore",
    prompts: [
      "Show me trending AI research topics",
      "What are the latest advancements in natural language processing?",
      "Find open source chatbot projects",
      "List popular AI APIs"
    ]
  },
  {
    key: "Create",
    prompts: [
      "Generate a creative story about a robot and a cat",
      "Write a poem about the ocean",
      "Create a fun quiz about programming",
      "Invent a new board game concept"
    ]
  }
];

const categoryIcons = {
  Code: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    </svg>
  ),
  Learn: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  ),
  Explore: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
  Create: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  )
};

export default function PromptTabs({ onPromptSelect }: PromptTabsProps) {
  const [activeCategory, setActiveCategory] = useState<string>("Code");

  const handlePromptClick = (prompt: string) => {
    onPromptSelect(prompt);
  };

  const activeCategoryData = promptCategories.find(cat => cat.key === activeCategory);

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-4">
      {/* Category Buttons - Square with Icons */}
      <div className="grid grid-cols-4 gap-3 mb-6 max-w-md mx-auto">
        {promptCategories.map((category) => (
          <button
            key={category.key}
            onClick={() => setActiveCategory(category.key)}
            className={`aspect-square flex flex-col items-center justify-center p-3 rounded-2xl font-medium transition-all duration-200 max-w-[80px] ${
              activeCategory === category.key
                ? "bg-emerald-600 text-white shadow-lg"
                : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
            }`}
          >
            <div className="mb-1">
              {categoryIcons[category.key as keyof typeof categoryIcons]}
            </div>
            <span className="text-xs font-semibold">{category.key}</span>
          </button>
        ))}
      </div>

      {/* Prompt Grid - Compact */}
      <div className="grid grid-cols-1 gap-3 max-w-xl mx-auto">
        {activeCategoryData?.prompts.map((prompt, index) => (
          <button
            key={index}
            onClick={() => handlePromptClick(prompt)}
            className="p-3 text-left bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-emerald-500 dark:hover:border-emerald-400 hover:shadow-md transition-all duration-200"
          >
            <p className="text-gray-900 dark:text-gray-100 text-sm leading-relaxed">
              {prompt}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
