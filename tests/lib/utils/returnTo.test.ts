import { getSafeReturnTo } from '../../../lib/utils/returnTo';

describe('getSafeReturnTo', () => {
  it('accepts a simple internal path', () => {
    expect(getSafeReturnTo('/account/subscription')).toBe('/account/subscription');
  });

  it('preserves query and hash', () => {
    const input = '/account/subscription?src=upgrade#billing';
    expect(getSafeReturnTo(input)).toBe(input);
  });

  it('rejects absolute URLs', () => {
    expect(getSafeReturnTo('https://evil.com')).toBeNull();
  });

  it('rejects values not starting with slash', () => {
    expect(getSafeReturnTo('chat')).toBeNull();
  });

  it('rejects backslashes', () => {
    expect(getSafeReturnTo('/account\\subscription')).toBeNull();
  });

  it('truncates overly long inputs and returns normalized or null', () => {
    const long = '/' + 'a'.repeat(600);
    const res = getSafeReturnTo(long);
    // It remains starting with '/', length <= 512
    if (res) {
      expect(res.startsWith('/')).toBe(true);
      expect(res.length).toBeLessThanOrEqual(512);
    }
  });
});
