import { useMemo, useState } from 'react';

import { type DiffFile } from '../../types/diff';
import { getFileExtension } from '../utils/fileExtension';

import { useDebouncedValue } from './useDebouncedValue';

const HIDDEN_EXTENSIONS_STORAGE_KEY = 'difit.filterHiddenExtensions';
const SHOW_VIEWED_FILES_STORAGE_KEY = 'difit.filterShowViewedFiles';
const FILTER_DEBOUNCE_MS = 300;

function getInitialHiddenExtensions(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const stored = window.localStorage.getItem(HIDDEN_EXTENSIONS_STORAGE_KEY);
    if (!stored) return new Set();
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((value): value is string => typeof value === 'string'));
  } catch {
    return new Set();
  }
}

function getInitialShowViewedFiles(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(SHOW_VIEWED_FILES_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

export interface FileFilter {
  filterText: string;
  setFilterText: (text: string) => void;
  isFilterInvalid: boolean;
  hiddenExtensions: Set<string>;
  toggleExtension: (extension: string) => void;
  showViewedFiles: boolean;
  setShowViewedFiles: (show: boolean) => void;
  clearFilters: () => void;
  hasActiveFilters: boolean;
  matchesFile: (file: DiffFile) => boolean;
}

export function useFileFilter(reviewedFiles: Set<string>): FileFilter {
  const [filterText, setFilterText] = useState('');
  const [hiddenExtensions, setHiddenExtensions] = useState<Set<string>>(getInitialHiddenExtensions);
  const [showViewedFiles, setShowViewedFilesState] = useState(getInitialShowViewedFiles);
  const debouncedFilterText = useDebouncedValue(filterText, FILTER_DEBOUNCE_MS);

  const { matchesFilterText, isFilterInvalid } = useMemo<{
    matchesFilterText: (path: string) => boolean;
    isFilterInvalid: boolean;
  }>(() => {
    const trimmed = debouncedFilterText.trim();
    if (!trimmed) {
      return { matchesFilterText: () => true, isFilterInvalid: false };
    }
    const isRegexPattern = trimmed.length >= 2 && trimmed.startsWith('/') && trimmed.endsWith('/');
    if (isRegexPattern) {
      try {
        const regex = new RegExp(trimmed.slice(1, -1), 'i');
        return { matchesFilterText: (path: string) => regex.test(path), isFilterInvalid: false };
      } catch {
        return { matchesFilterText: () => false, isFilterInvalid: true };
      }
    }
    const needle = trimmed.toLowerCase();
    return {
      matchesFilterText: (path: string) => path.toLowerCase().includes(needle),
      isFilterInvalid: false,
    };
  }, [debouncedFilterText]);

  const updateHiddenExtensions = (next: Set<string>) => {
    setHiddenExtensions(next);
    try {
      window.localStorage.setItem(HIDDEN_EXTENSIONS_STORAGE_KEY, JSON.stringify(Array.from(next)));
    } catch {
      // Ignore localStorage errors (e.g. disabled storage).
    }
  };

  const setShowViewedFiles = (next: boolean) => {
    setShowViewedFilesState(next);
    try {
      window.localStorage.setItem(SHOW_VIEWED_FILES_STORAGE_KEY, String(next));
    } catch {
      // Ignore localStorage errors (e.g. disabled storage).
    }
  };

  const toggleExtension = (extension: string) => {
    const next = new Set(hiddenExtensions);
    if (next.has(extension)) {
      next.delete(extension);
    } else {
      next.add(extension);
    }
    updateHiddenExtensions(next);
  };

  const clearFilters = () => {
    setFilterText('');
    updateHiddenExtensions(new Set());
    setShowViewedFiles(true);
  };

  const hasActiveFilters =
    filterText.trim() !== '' || hiddenExtensions.size > 0 || !showViewedFiles;

  const matchesFile = useMemo(
    () =>
      (file: DiffFile): boolean => {
        if (!matchesFilterText(file.path)) return false;
        if (hiddenExtensions.has(getFileExtension(file.path))) return false;
        if (!showViewedFiles && reviewedFiles.has(file.path)) return false;
        return true;
      },
    [matchesFilterText, hiddenExtensions, showViewedFiles, reviewedFiles],
  );

  return {
    filterText,
    setFilterText,
    isFilterInvalid,
    hiddenExtensions,
    toggleExtension,
    showViewedFiles,
    setShowViewedFiles,
    clearFilters,
    hasActiveFilters,
    matchesFile,
  };
}
