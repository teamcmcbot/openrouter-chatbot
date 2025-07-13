// tests/stores/useSettingsStore.test.ts

import { renderHook, act } from '@testing-library/react';
import { useSettingsStore, useLocalStorage } from '../../stores/useSettingsStore';

describe('useSettingsStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useSettingsStore.setState({
      settings: {},
      isHydrated: true,
      error: null,
      lastUpdated: null,
    });
    
    // Clear localStorage
    localStorage.clear();
  });

  it('should set and get settings', () => {
    const store = useSettingsStore.getState();
    
    // Set a setting
    store.setSetting('testKey', 'testValue');
    
    // Get the setting
    const value = store.getSetting('testKey');
    expect(value).toBe('testValue');
  });

  it('should remove settings', () => {
    const store = useSettingsStore.getState();
    
    // Set a setting
    store.setSetting('testKey', 'testValue');
    expect(store.getSetting('testKey')).toBe('testValue');
    
    // Remove the setting
    store.removeSetting('testKey');
    expect(store.getSetting('testKey')).toBeUndefined();
  });

  it('should clear all settings', () => {
    const store = useSettingsStore.getState();
    
    // Set multiple settings
    store.setSetting('key1', 'value1');
    store.setSetting('key2', 'value2');
    
    // Clear all
    store.clearAllSettings();
    
    const state = useSettingsStore.getState();
    expect(Object.keys(state.settings)).toHaveLength(0);
  });

  it('should export and import settings', () => {
    const store = useSettingsStore.getState();
    
    // Set some settings
    store.setSetting('key1', 'value1');
    store.setSetting('key2', 'value2');
    
    // Export settings
    const exported = store.exportSettings();
    expect(exported).toEqual({
      key1: 'value1',
      key2: 'value2',
    });
    
    // Clear and import
    store.clearAllSettings();
    store.importSettings(exported);
    
    expect(store.getSetting('key1')).toBe('value1');
    expect(store.getSetting('key2')).toBe('value2');
  });
});

describe('useLocalStorage (backward compatibility)', () => {
  beforeEach(() => {
    // Reset store state before each test
    useSettingsStore.setState({
      settings: {},
      isHydrated: true,
      error: null,
      lastUpdated: null,
    });
    
    localStorage.clear();
  });

  it('should work with string values', () => {
    const { result } = renderHook(() => 
      useLocalStorage('test-string', 'initial')
    );

    // Should return initial value
    expect(result.current[0]).toBe('initial');

    // Should update value
    act(() => {
      result.current[1]('updated');
    });

    expect(result.current[0]).toBe('updated');
  });

  it('should work with object values', () => {
    const initialObject = { test: 'value' };
    const { result } = renderHook(() => 
      useLocalStorage('test-object', initialObject)
    );

    // Should return initial value
    expect(result.current[0]).toEqual(initialObject);

    // Should update value
    const newObject = { test: 'updated' };
    act(() => {
      result.current[1](newObject);
    });

    expect(result.current[0]).toEqual(newObject);
  });

  it('should work with function updates', () => {
    const { result } = renderHook(() => 
      useLocalStorage('test-counter', 0)
    );

    // Should update with function
    act(() => {
      result.current[1]((prev) => prev + 1);
    });

    expect(result.current[0]).toBe(1);
  });
});
