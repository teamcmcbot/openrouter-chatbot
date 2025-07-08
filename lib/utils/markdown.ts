// Utility function to detect if content contains markdown
export function detectMarkdownContent(content: string): boolean {
  // Simple heuristic to detect markdown content
  const markdownPatterns = [
    /```[\s\S]*?```/,           // Code blocks
    /`[^`\n]+`/,                // Inline code
    /\*\*[^*\n]+\*\*/,          // Bold text
    /\*[^*\n]+\*/,              // Italic text
    /#{1,6}\s+.+/,              // Headers
    /^\s*[-*+]\s+/m,            // Bullet lists
    /^\s*\d+\.\s+/m,            // Numbered lists
    /\|.*\|/,                   // Tables
    /^\s*>\s+/m,                // Blockquotes
    /\[([^\]]+)\]\(([^)]+)\)/,  // Links
  ];

  return markdownPatterns.some(pattern => pattern.test(content));
}

// More comprehensive markdown detection
export function detectMarkdownContentAdvanced(content: string): boolean {
  // Score-based detection for better accuracy
  let score = 0;
  
  // Code blocks (high weight)
  if (/```[\s\S]*?```/.test(content)) score += 10;
  
  // Inline code (medium weight)
  if (/`[^`\n]+`/.test(content)) score += 3;
  
  // Bold/italic (medium weight)
  if (/\*\*[^*\n]+\*\*/.test(content)) score += 3;
  if (/\*[^*\n]+\*/.test(content)) score += 2;
  
  // Headers (high weight)
  if (/#{1,6}\s+.+/.test(content)) score += 5;
  
  // Lists (medium weight)
  if (/^\s*[-*+]\s+/m.test(content)) score += 3;
  if (/^\s*\d+\.\s+/m.test(content)) score += 3;
  
  // Tables (high weight)
  if (/\|.*\|/.test(content)) score += 8;
  
  // Blockquotes (medium weight)
  if (/^\s*>\s+/m.test(content)) score += 3;
  
  // Links (low weight)
  if (/\[([^\]]+)\]\(([^)]+)\)/.test(content)) score += 2;
  
  // Threshold for considering content as markdown
  return score >= 5;
}
