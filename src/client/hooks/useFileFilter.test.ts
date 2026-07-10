import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type DiffFile } from '../../types/diff';

import { useFileFilter } from './useFileFilter';

const file = (path: string): DiffFile => ({
  path,
  status: 'modified',
  additions: 1,
  deletions: 1,
  chunks: [],
});

const NO_REVIEWED = new Set<string>();

beforeEach(() => {
  window.localStorage.clear();
});

describe('useFileFilter', () => {
  it('reports hasActiveFilters immediately when typing (before debounce)', () => {
    const { result } = renderHook(() => useFileFilter(NO_REVIEWED));

    expect(result.current.hasActiveFilters).toBe(false);
    act(() => result.current.setFilterText('x'));
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it('applies the text filter only after the 300ms debounce', () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useFileFilter(NO_REVIEWED));

      act(() => result.current.setFilterText('a.tsx'));
      // Not applied yet: matcher still matches everything.
      expect(result.current.matchesFile(file('src/c.ts'))).toBe(true);

      act(() => vi.advanceTimersByTime(299));
      expect(result.current.matchesFile(file('src/c.ts'))).toBe(true);

      act(() => vi.advanceTimersByTime(1));
      expect(result.current.matchesFile(file('src/a.tsx'))).toBe(true);
      expect(result.current.matchesFile(file('src/c.ts'))).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('resets the debounce timer on rapid typing', () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useFileFilter(NO_REVIEWED));

      act(() => result.current.setFilterText('a'));
      act(() => vi.advanceTimersByTime(200));
      act(() => result.current.setFilterText('a.tsx'));
      act(() => vi.advanceTimersByTime(200));
      // Only 200ms since the last keystroke -> still not applied.
      expect(result.current.matchesFile(file('src/c.ts'))).toBe(true);

      act(() => vi.advanceTimersByTime(100));
      expect(result.current.matchesFile(file('src/c.ts'))).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('supports case-insensitive /regex/ patterns', () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useFileFilter(NO_REVIEWED));

      act(() => result.current.setFilterText('/\\.ts$/'));
      act(() => vi.advanceTimersByTime(300));
      expect(result.current.isFilterInvalid).toBe(false);
      expect(result.current.matchesFile(file('src/c.ts'))).toBe(true);
      expect(result.current.matchesFile(file('src/a.tsx'))).toBe(false);

      act(() => result.current.setFilterText('/SRC\\/A/'));
      act(() => vi.advanceTimersByTime(300));
      expect(result.current.matchesFile(file('src/a.tsx'))).toBe(true);
      expect(result.current.matchesFile(file('src/b.tsx'))).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('flags an invalid /regex/ and matches nothing', () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useFileFilter(NO_REVIEWED));

      act(() => result.current.setFilterText('/[/'));
      act(() => vi.advanceTimersByTime(300));

      expect(result.current.isFilterInvalid).toBe(true);
      expect(result.current.matchesFile(file('src/a.tsx'))).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('hides files by extension immediately and persists the choice', () => {
    const { result } = renderHook(() => useFileFilter(NO_REVIEWED));

    act(() => result.current.toggleExtension('.tsx'));

    expect(result.current.matchesFile(file('src/a.tsx'))).toBe(false);
    expect(result.current.matchesFile(file('src/c.ts'))).toBe(true);
    expect(window.localStorage.getItem('difit.filterHiddenExtensions')).toBe(
      JSON.stringify(['.tsx']),
    );
  });

  it('hides reviewed files when showViewedFiles is off and persists it', () => {
    const reviewed = new Set(['src/a.tsx']);
    const { result } = renderHook(() => useFileFilter(reviewed));

    act(() => result.current.setShowViewedFiles(false));

    expect(result.current.matchesFile(file('src/a.tsx'))).toBe(false);
    expect(result.current.matchesFile(file('src/b.tsx'))).toBe(true);
    expect(window.localStorage.getItem('difit.filterShowViewedFiles')).toBe('false');
  });

  it('restores persisted filters on init', () => {
    window.localStorage.setItem('difit.filterHiddenExtensions', JSON.stringify(['.ts']));
    window.localStorage.setItem('difit.filterShowViewedFiles', 'false');

    const { result } = renderHook(() => useFileFilter(new Set(['src/a.tsx'])));

    expect(result.current.hiddenExtensions.has('.ts')).toBe(true);
    expect(result.current.showViewedFiles).toBe(false);
    expect(result.current.matchesFile(file('src/c.ts'))).toBe(false);
    expect(result.current.matchesFile(file('src/a.tsx'))).toBe(false);
    expect(result.current.matchesFile(file('src/b.tsx'))).toBe(true);
  });

  it('clears text, extension and viewed filters via clearFilters', () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useFileFilter(NO_REVIEWED));

      act(() => {
        result.current.setFilterText('/\\.ts$/');
        result.current.toggleExtension('.md');
        result.current.setShowViewedFiles(false);
      });
      act(() => vi.advanceTimersByTime(300));

      act(() => result.current.clearFilters());
      act(() => vi.advanceTimersByTime(300));

      expect(result.current.filterText).toBe('');
      expect(result.current.hiddenExtensions.size).toBe(0);
      expect(result.current.showViewedFiles).toBe(true);
      expect(result.current.hasActiveFilters).toBe(false);
      expect(result.current.matchesFile(file('src/a.tsx'))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
