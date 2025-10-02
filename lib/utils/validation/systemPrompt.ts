/**
 * System Prompt Validation Utility
 * Shared validation logic for both client and server-side validation
 */

export const SYSTEM_PROMPT_LIMITS = {
  MAX_LENGTH: 2000,              // Updated from 4000 for better UX
  MIN_LENGTH: 1,                 // After trim
  PREVIEW_LENGTH: 200,           // For word-boundary truncation
  MAX_CONSECUTIVE_SPACES: 50,    // Abuse prevention
  MAX_CONSECUTIVE_NEWLINES: 10   // Abuse prevention
} as const;

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  trimmedValue?: string;
}

/**
 * Validates system prompt input with comprehensive security and abuse prevention
 * @param prompt - The system prompt to validate
 * @returns ValidationResult with isValid flag and optional error message
 */
export function validateSystemPrompt(prompt: string): ValidationResult {
  // Trim the input first
  const trimmed = prompt.trim();
  
  // Empty check
  if (trimmed.length === 0) {
    return {
      isValid: false,
      error: "System prompt cannot be empty"
    };
  }
  
  // Length check
  if (trimmed.length > SYSTEM_PROMPT_LIMITS.MAX_LENGTH) {
    return {
      isValid: false,
      error: `System prompt must be ${SYSTEM_PROMPT_LIMITS.MAX_LENGTH} characters or less`
    };
  }
  
  // Excessive whitespace prevention
  if (/\n{11,}/.test(prompt)) {
    return {
      isValid: false,
      error: "Too many consecutive line breaks"
    };
  }
  
  if (/\s{51,}/.test(prompt)) {
    return {
      isValid: false,
      error: "Too many consecutive spaces"
    };
  }
  
  // Security: HTML/Script filtering
  const scriptPatterns = [
    /<script\b/i,
    /<iframe\b/i,
    /<object\b/i,
    /<embed\b/i,
    /on\w+\s*=/i,        // Event handlers like onload=, onerror=
    /javascript:/i,
    /data:text\/html/i
  ];
  
  for (const pattern of scriptPatterns) {
    if (pattern.test(prompt)) {
      return {
        isValid: false,
        error: "System prompt contains unsafe content"
      };
    }
  }
  
  // Control characters check
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(prompt)) {
    return {
      isValid: false,
      error: "System prompt contains invalid characters"
    };
  }
  
  return {
    isValid: true,
    trimmedValue: trimmed
  };
}

/**
 * Truncates text at word boundaries for better readability in previews
 * @param text - Text to truncate
 * @param maxLength - Maximum character length (default: 200)
 * @returns Truncated text with ellipsis if needed
 */
export function truncateAtWordBoundary(text: string, maxLength: number = SYSTEM_PROMPT_LIMITS.PREVIEW_LENGTH): string {
  if (text.length <= maxLength) {
    return text;
  }
  
  const truncated = text.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  
  // If we find a space within reasonable distance (75% of maxLength), truncate there
  if (lastSpace > maxLength * 0.75) {
    return truncated.substring(0, lastSpace) + '...';
  }
  
  // Otherwise truncate at character boundary with ellipsis
  return truncated + '...';
}

/**
 * Sanitizes system prompt for safe display (escapes HTML entities)
 * @param text - Text to sanitize
 * @returns Sanitized text safe for HTML display
 */
export function sanitizeForDisplay(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Validates personality preset key (not freeform text)
 * @param presetKey - The personality preset key to validate (e.g., 'helpful', 'professional')
 * @returns ValidationResult with isValid flag and optional error message
 */
export function validatePersonalityPreset(presetKey: string | null | undefined): ValidationResult {
  // Null/undefined is allowed (user can clear preset)
  if (presetKey === null || presetKey === undefined || presetKey.trim() === '') {
    return {
      isValid: true,
      trimmedValue: undefined
    };
  }
  
  // Valid preset keys
  const validKeys = ['helpful', 'professional', 'creative', 'concise', 'empathetic', 'technical', 'socratic', 'witty'];
  
  // Validate it's a known preset key
  if (!validKeys.includes(presetKey)) {
    return {
      isValid: false,
      error: `Invalid personality preset: "${presetKey}". Must be one of: ${validKeys.join(', ')}`
    };
  }
  
  return {
    isValid: true,
    trimmedValue: presetKey
  };
}
