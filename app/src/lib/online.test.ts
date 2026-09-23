// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { OFFLINE_TEXT, isOnline, useOnline } from '@/lib/online';

describe('online', () => {
  it('reads navigator.onLine synchronously (offline at boot shows on the first render)', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(isOnline()).toBe(false);
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(false);
  });
  it('follows online/offline events', () => {
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(true);
    spy.mockReturnValue(false);
    act(() => { window.dispatchEvent(new Event('offline')); });
    expect(result.current).toBe(false);
  });
  it('copy', () => { expect(OFFLINE_TEXT).toBe('אין חיבור. השינויים יישמרו במכשיר.'); });
});
