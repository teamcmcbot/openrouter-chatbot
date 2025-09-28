export type CatalogProviderSlug =
  | 'openai'
  | 'google'
  | 'anthropic'
  | 'xai'
  | 'zai'
  | 'moonshot'
  | 'mistral'
  | 'other';

export const CATALOG_PROVIDER_LABELS: Record<CatalogProviderSlug, string> = {
  openai: 'OpenAI',
  google: 'Google',
  anthropic: 'Anthropic',
  xai: 'xAI',
  zai: 'Z.AI',
  moonshot: 'Moonshot AI',
  mistral: 'Mistral',
  other: 'Other',
};

export const CATALOG_PROVIDER_DISPLAY_ORDER: CatalogProviderSlug[] = [
  'openai',
  'google',
  'anthropic',
  'xai',
  'zai',
  'moonshot',
  'mistral',
  'other',
];
