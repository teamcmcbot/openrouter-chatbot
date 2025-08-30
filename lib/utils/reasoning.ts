// Utility helpers for reasoning metadata normalization

/**
 * Coerce a backend-provided reasoning_details value into a consistent array shape.
 * - If it's already an array, return as-is.
 * - If it's a plain object, wrap into a single-element array.
 * - Otherwise, return undefined.
 */
export function coerceReasoningDetailsToArray(
  value: unknown
): Record<string, unknown>[] | undefined {
  if (Array.isArray(value)) return value as Record<string, unknown>[];
  if (value && typeof value === "object") return [value as Record<string, unknown>];
  return undefined;
}
