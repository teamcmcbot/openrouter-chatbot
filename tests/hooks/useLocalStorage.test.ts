import { renderHook, act } from '@testing-library/react';
import { useLocalStorage } from '../../hooks/useLocalStorage';

describe('useLocalStorage', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  it('returns initial value when localStorage is empty', () => {
    const { result } = renderHook(() => 
      useLocalStorage<string>('test-key', 'initial-value')
    );

    expect(result.current[0]).toBe('initial-value');
  });

  it('stores and retrieves value from localStorage', () => {
    const { result } = renderHook(() => 
      useLocalStorage<string>('test-key', 'initial-value')
    );

    act(() => {
      result.current[1]('new-value');
    });

    expect(result.current[0]).toBe('new-value');
    expect(localStorage.getItem('test-key')).toBe('"new-value"');
  });

  it('loads existing value from localStorage', () => {
    localStorage.setItem('test-key', '"existing-value"');

    const { result } = renderHook(() => 
      useLocalStorage<string>('test-key', 'initial-value')
    );

    expect(result.current[0]).toBe('existing-value');
  });

  it('handles localStorage parsing errors gracefully', () => {
    localStorage.setItem('test-key', 'invalid-json');

    const { result } = renderHook(() => 
      useLocalStorage<string>('test-key', 'fallback-value')
    );

    expect(result.current[0]).toBe('fallback-value');
  });
});
