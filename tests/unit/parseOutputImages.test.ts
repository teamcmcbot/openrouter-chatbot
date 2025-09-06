import { extractOutputImageDataUrls } from '../../lib/utils/parseOutputImages';

// Minimal mock shapes to test both primary and fallback extraction paths

describe('extractOutputImageDataUrls', () => {
  it('returns empty array when response undefined', () => {
    expect(extractOutputImageDataUrls(undefined)).toEqual([]);
  });

  it('extracts from primary message.images string array', () => {
    const resp = {
      choices: [
        { message: { images: [
          'data:image/png;base64,AAA',
          'data:image/png;base64,BBB'
        ] } }
      ]
    };
    expect(extractOutputImageDataUrls(resp)).toEqual([
      'data:image/png;base64,AAA',
      'data:image/png;base64,BBB'
    ]);
  });

  it('extracts from primary objects with image_url.url', () => {
    const resp = {
      choices: [
        { message: { images: [
          { type: 'image_url', image_url: { url: 'data:image/webp;base64,XXX' } },
          { image_url: { url: 'data:image/jpeg;base64,YYY' } },
        ] } }
      ]
    };
    expect(extractOutputImageDataUrls(resp)).toEqual([
      'data:image/webp;base64,XXX',
      'data:image/jpeg;base64,YYY'
    ]);
  });

  it('deduplicates repeated images', () => {
    const resp = {
      choices: [
        { message: { images: [
          'data:image/png;base64,AAA',
          { image_url: { url: 'data:image/png;base64,AAA' } }
        ] } }
      ]
    };
    expect(extractOutputImageDataUrls(resp)).toEqual(['data:image/png;base64,AAA']);
  });

  it('extracts fallback data URLs from content string', () => {
    const resp = {
      choices: [
        { message: { content: 'Here is an image data:image/png;base64,QWER and another data:image/jpeg;base64,ZXCV' } }
      ]
    };
    expect(extractOutputImageDataUrls(resp)).toEqual([
      'data:image/png;base64,QWER',
      'data:image/jpeg;base64,ZXCV'
    ]);
  });

  it('extracts fallback data URLs from content parts', () => {
    const resp = {
      choices: [
        { message: { content: [
          { type: 'text', text: 'Intro data:image/png;base64,AAAA' },
          { type: 'text', text: 'Second data:image/webp;base64,BBBB' }
        ] } }
      ]
    };
    expect(extractOutputImageDataUrls(resp)).toEqual([
      'data:image/png;base64,AAAA',
      'data:image/webp;base64,BBBB'
    ]);
  });
});
