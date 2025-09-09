// Phase 2 helper: extract assistant output images (data URLs) from an OpenRouter
// chat completion response. This covers two shapes:
// 1. Primary (preferred) shape: choices[0].message.images[] items containing objects with
//    { type: 'image_url', image_url: { url: 'data:image/png;base64,...' } }
//    or directly strings already data URLs.
// 2. Fallback: data URLs embedded inside message.content parts (array of objects or strings).
//    We scan for any substrings that look like data:image/<ext>;base64,<payload>
//
// NOTE: We deliberately do NOT log any raw data URLs. Callers must avoid passing
// the extracted strings into logger context.
//
// This is a temporary Phase 2 mechanism; Phase 2.5 will persist images to storage
// and remove large base64 payloads from in-memory history.

const DATA_URL_REGEX = /data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+/g;

interface ORMessageMinimal {
  images?: unknown;
  content?: unknown;
  [k: string]: unknown;
}

export interface OpenRouterLikeResponse {
  choices?: Array<{
    // Using unknown to avoid unsafe any; we narrow to ORMessageMinimal when accessed.
    message?: unknown;
  }>;
}

/**
 * Extract data URL images from an OpenRouter response.
 * Returns a de-duplicated array (order preserved by first appearance).
 */
export function extractOutputImageDataUrls(resp: OpenRouterLikeResponse | undefined | null): string[] {
  if (!resp || !Array.isArray(resp.choices) || resp.choices.length === 0) return [];
  const raw = resp.choices[0]?.message;
  const first: ORMessageMinimal = (raw && typeof raw === 'object') ? (raw as ORMessageMinimal) : {};
  const out: string[] = [];
  const seen = new Set<string>();

  // Primary path: message.images
  try {
    const imgs = first.images;
    if (Array.isArray(imgs)) {
      for (const item of imgs) {
        if (typeof item === 'string' && item.startsWith('data:image/')) {
          if (!seen.has(item)) { seen.add(item); out.push(item); }
          continue;
        }
        if (item && typeof item === 'object') {
          // Common OpenAI-style shape { type: 'image_url', image_url: { url } }
            const url = item?.image_url?.url || item?.url || (typeof item?.data === 'string' ? item.data : undefined);
            if (typeof url === 'string' && url.startsWith('data:image/')) {
              if (!seen.has(url)) { seen.add(url); out.push(url); }
            }
        }
      }
    }
  } catch {
    // swallow – failure to parse shouldn't abort fallback
  }

  // Fallback path: scan message.content
  try {
    const content = first.content;
    if (Array.isArray(content)) {
      for (const part of content) {
        if (!part) continue;
        if (typeof part === 'string') {
          const matches = part.match(DATA_URL_REGEX);
          if (matches) {
            for (const m of matches) if (!seen.has(m)) { seen.add(m); out.push(m); }
          }
        } else if (typeof part === 'object') {
          // Some providers put text in part.text or part.content
          const txt: unknown = part.text || part.content || part.value;
          if (typeof txt === 'string') {
            const matches = txt.match(DATA_URL_REGEX);
            if (matches) {
              for (const m of matches) if (!seen.has(m)) { seen.add(m); out.push(m); }
            }
          }
        }
      }
    } else if (typeof content === 'string') {
      const matches = content.match(DATA_URL_REGEX);
      if (matches) {
        for (const m of matches) if (!seen.has(m)) { seen.add(m); out.push(m); }
      }
    }
  } catch {
    // swallow
  }

  return out;
}

export default extractOutputImageDataUrls;
