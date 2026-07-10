import {
  ChevronRight,
  ChevronDown,
  FileDiff,
  FolderOpen,
  Folder,
  FilePlus,
  FileX,
  FilePen,
  Search,
  Filter,
  MessageSquare,
  ChevronsDownUp,
  ChevronsUpDown,
} from 'lucide-react';
import { memo, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';

import { type DiffFile, type CommentThread } from '../../types/diff';
import { useClickOutside } from '../hooks/useClickOutside';
import { isSafariBrowser } from '../utils/browser';

import { Checkbox } from './Checkbox';

interface FileListProps {
  files: DiffFile[];
  onScrollToFile: (path: string) => void;
  onFileSelected?: () => void;
  comments: CommentThread[];
  reviewedFiles: Set<string>;
  onToggleReviewed: (path: string) => void;
  onToggleFolderReviewed: (path: string, reviewed: boolean) => void;
  selectedFileIndex: number | null;
}

interface TreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: TreeNode[];
  file?: DiffFile;
}

const TREE_ROW_PADDING_LEFT_PX = 16;
const TREE_ICON_SIZE_PX = 16;
const TREE_ROW_GAP_PX = 8;
const TREE_INDENT_STEP_PX = TREE_ICON_SIZE_PX + TREE_ROW_GAP_PX;

function getTreeRowPaddingLeft(depth: number): string {
  return `${depth * TREE_INDENT_STEP_PX + TREE_ROW_PADDING_LEFT_PX}px`;
}

const NO_EXTENSION_KEY = '';
const NO_EXTENSION_LABEL = 'No extension';
const HIDDEN_EXTENSIONS_STORAGE_KEY = 'difit.filterHiddenExtensions';
const SHOW_VIEWED_FILES_STORAGE_KEY = 'difit.filterShowViewedFiles';

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

function getFileExtension(path: string): string {
  const basename = path.slice(path.lastIndexOf('/') + 1);
  const dotIndex = basename.lastIndexOf('.');
  if (dotIndex <= 0) return NO_EXTENSION_KEY;
  return basename.slice(dotIndex).toLowerCase();
}

function getAllDirectoryPaths(node: TreeNode): string[] {
  if (!node.isDirectory || !node.children) return [];
  const paths: string[] = [];
  if (node.path) paths.push(node.path);
  node.children.forEach((child) => {
    paths.push(...getAllDirectoryPaths(child));
  });
  return paths;
}

function getReviewedDirectoryPaths(node: TreeNode, reviewedFiles: Set<string>): Set<string> {
  const reviewedDirectoryPaths = new Set<string>();

  const visit = (currentNode: TreeNode): boolean => {
    if (currentNode.file) {
      return reviewedFiles.has(currentNode.file.path);
    }

    if (!currentNode.isDirectory || !currentNode.children || currentNode.children.length === 0) {
      return false;
    }

    const childrenReviewed = currentNode.children.map((child) => visit(child));
    const areAllChildrenReviewed = childrenReviewed.every(Boolean);
    if (areAllChildrenReviewed && currentNode.path) {
      reviewedDirectoryPaths.add(currentNode.path);
    }
    return areAllChildrenReviewed;
  };

  visit(node);
  return reviewedDirectoryPaths;
}

function buildFileTree(files: DiffFile[]): TreeNode {
  const root: TreeNode = {
    name: '',
    path: '',
    isDirectory: true,
    children: [],
  };

  files.forEach((file) => {
    const parts = file.path.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part) continue;

      const isLast = i === parts.length - 1;
      const pathSoFar = parts.slice(0, i + 1).join('/');

      if (!current.children) {
        current.children = [];
      }

      let child = current.children.find((c) => c.name === part);

      if (!child) {
        child = {
          name: part,
          path: pathSoFar,
          isDirectory: !isLast,
          children: isLast ? undefined : [],
          file: isLast ? file : undefined,
        };
        current.children.push(child);
      }

      current = child;
    }
  });

  // Collapse single child directories
  const collapseDirectories = (node: TreeNode): TreeNode => {
    if (!node.isDirectory || !node.children) {
      return node;
    }

    // First, recursively collapse children
    node.children = node.children.map(collapseDirectories);

    // If this directory has only one child directory (no files), collapse them
    if (node.children.length === 1 && node.children[0]?.isDirectory && node.children[0]?.children) {
      const child = node.children[0];
      if (child) {
        // Don't collapse the root node - keep the full path structure
        if (!node.name) {
          return node;
        }
        return {
          ...node,
          name: `${node.name}/${child.name}`,
          path: child.path,
          children: child.children,
        };
      }
    }

    return node;
  };

  return collapseDirectories(root);
}

export const FileList = memo(function FileList({
  files,
  onScrollToFile,
  onFileSelected,
  comments,
  reviewedFiles,
  onToggleReviewed,
  onToggleFolderReviewed,
  selectedFileIndex,
}: FileListProps) {
  const fileTree = useMemo(() => buildFileTree(files), [files]);
  const shouldUseStickyDirectoryHeaders = useMemo(
    () => !isSafariBrowser(typeof navigator === 'undefined' ? '' : navigator.userAgent),
    [],
  );
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const dirContainerRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const stickyContainerStyle = {
    '--dir-row-height': 'calc(var(--spacing, 0.25rem) * 9)',
  } as CSSProperties;

  // Initialize with all directories expanded
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(
    () => new Set(getAllDirectoryPaths(fileTree)),
  );
  const [filterText, setFilterText] = useState('');
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [hiddenExtensions, setHiddenExtensions] = useState<Set<string>>(getInitialHiddenExtensions);
  const [showViewedFiles, setShowViewedFiles] = useState(getInitialShowViewedFiles);
  const filterMenuRef = useRef<HTMLDivElement>(null);

  useClickOutside(filterMenuRef, () => setIsFilterMenuOpen(false), isFilterMenuOpen);

  const commentCountMap = useMemo(() => {
    const counts = new Map<string, number>();
    comments.forEach((comment) => {
      counts.set(comment.file, (counts.get(comment.file) ?? 0) + 1);
    });
    return counts;
  }, [comments]);

  const fileIndexMap = useMemo(() => {
    const indices = new Map<string, number>();
    files.forEach((file, index) => {
      indices.set(file.path, index);
    });
    return indices;
  }, [files]);
  const diffTotals = useMemo(
    () =>
      files.reduce(
        (totals, file) => ({
          additions: totals.additions + file.additions,
          deletions: totals.deletions + file.deletions,
        }),
        { additions: 0, deletions: 0 },
      ),
    [files],
  );
  const reviewedDirectoryPaths = useMemo(
    () => getReviewedDirectoryPaths(fileTree, reviewedFiles),
    [fileTree, reviewedFiles],
  );

  const extensionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    files.forEach((file) => {
      const extension = getFileExtension(file.path);
      counts.set(extension, (counts.get(extension) ?? 0) + 1);
    });
    return counts;
  }, [files]);

  const sortedExtensions = useMemo(
    () =>
      Array.from(extensionCounts.keys()).sort((a, b) => {
        if (a === NO_EXTENSION_KEY) return 1;
        if (b === NO_EXTENSION_KEY) return -1;
        return a.localeCompare(b);
      }),
    [extensionCounts],
  );

  const hasActiveFilters =
    filterText.trim() !== '' || hiddenExtensions.size > 0 || !showViewedFiles;

  const updateHiddenExtensions = (next: Set<string>) => {
    setHiddenExtensions(next);
    try {
      window.localStorage.setItem(HIDDEN_EXTENSIONS_STORAGE_KEY, JSON.stringify(Array.from(next)));
    } catch {
      // Ignore localStorage errors (e.g. disabled storage).
    }
  };

  const updateShowViewedFiles = (next: boolean) => {
    setShowViewedFiles(next);
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
    updateShowViewedFiles(true);
  };

  const { matchesFilterText, isFilterInvalid } = useMemo<{
    matchesFilterText: (path: string) => boolean;
    isFilterInvalid: boolean;
  }>(() => {
    const trimmed = filterText.trim();
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
  }, [filterText]);

  // Filter the file tree based on the search text, selected extensions, and viewed state
  const filteredFileTree = useMemo(() => {
    const hasNoActiveFilter =
      filterText.trim() === '' && hiddenExtensions.size === 0 && showViewedFiles;

    const matchesFilters = (file: DiffFile): boolean => {
      if (!matchesFilterText(file.path)) {
        return false;
      }
      if (hiddenExtensions.has(getFileExtension(file.path))) {
        return false;
      }
      if (!showViewedFiles && reviewedFiles.has(file.path)) {
        return false;
      }
      return true;
    };

    const filterTreeNode = (node: TreeNode): TreeNode | null => {
      if (hasNoActiveFilter) return node;

      if (node.isDirectory && node.children) {
        const filteredChildren = node.children
          .map((child) => filterTreeNode(child))
          .filter((child) => child !== null);

        if (filteredChildren.length > 0) {
          return { ...node, children: filteredChildren };
        }
        return null;
      } else if (node.file) {
        return matchesFilters(node.file) ? node : null;
      }

      return null;
    };

    return (
      filterTreeNode(fileTree) || {
        ...fileTree,
        children: [],
      }
    );
  }, [fileTree, filterText, matchesFilterText, hiddenExtensions, showViewedFiles, reviewedFiles]);

  const getFileIcon = (status: DiffFile['status']) => {
    switch (status) {
      case 'added':
        return <FilePlus size={16} className="text-github-accent" />;
      case 'deleted':
        return <FileX size={16} className="text-github-danger" />;
      case 'renamed':
        return <FilePen size={16} className="text-github-warning" />;
      default:
        return <FileDiff size={16} className="text-github-text-secondary" />;
    }
  };

  const toggleDirectory = (path: string) => {
    setExpandedDirs((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  };

  const allPaths = useMemo(() => getAllDirectoryPaths(fileTree), [fileTree]);
  const isAllExpanded = expandedDirs.size === allPaths.length && allPaths.length > 0;

  const toggleAllDirectories = () => {
    // If all directories are expanded, collapse all. Otherwise, expand all.
    if (isAllExpanded) {
      setExpandedDirs(new Set());
    } else {
      setExpandedDirs(new Set(allPaths));
    }
  };

  const handleDirectoryClick = (event: MouseEvent<HTMLDivElement>, path: string) => {
    if (!shouldUseStickyDirectoryHeaders) {
      toggleDirectory(path);
      return;
    }

    const container = scrollContainerRef.current;
    const row = event.currentTarget;

    if (!container) {
      toggleDirectory(path);
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const topOffset = Number.parseFloat(getComputedStyle(row).top || '0');
    const relativeTop = rowRect.top - containerRect.top;
    const isSticky = relativeTop <= topOffset + 1;

    if (isSticky) {
      const wrapper = dirContainerRefs.current.get(path);
      const firstChild = wrapper?.querySelector<HTMLElement>(
        '[data-tree-row="true"]:not([data-dir-header="true"])',
      );
      const rowHeight = row.getBoundingClientRect().height || 0;
      const target = firstChild ?? row;
      const depthValue = Number.parseInt(target.dataset.depth || row.dataset.depth || '0', 10);
      const stackedOffset = rowHeight * depthValue;
      const targetScrollTop = Math.max(0, target.offsetTop - stackedOffset);

      if (Math.abs(container.scrollTop - targetScrollTop) <= 1) {
        toggleDirectory(path);
        return;
      }

      container.scrollTo({ top: targetScrollTop });
      return;
    }

    toggleDirectory(path);
  };

  const renderTreeNode = (node: TreeNode, depth: number = 0): React.ReactNode => {
    if (node.isDirectory && node.children) {
      const isExpanded = expandedDirs.has(node.path);
      const isReviewed = reviewedDirectoryPaths.has(node.path);

      return (
        <div
          key={node.path}
          data-dir-container={node.path || undefined}
          ref={(el) => {
            if (!node.path) return;
            if (el) {
              dirContainerRefs.current.set(node.path, el);
            } else {
              dirContainerRefs.current.delete(node.path);
            }
          }}
        >
          {node.name && (
            <div
              className={`${shouldUseStickyDirectoryHeaders ? 'sticky ' : ''}group flex h-9 items-center gap-2 bg-github-bg-secondary px-4 hover:bg-github-bg-tertiary cursor-pointer ${
                isReviewed ? 'opacity-70' : ''
              }`}
              data-dir-header="true"
              data-tree-row="true"
              data-depth={depth}
              style={{
                paddingLeft: getTreeRowPaddingLeft(depth),
                top: shouldUseStickyDirectoryHeaders
                  ? `calc(${depth} * var(--dir-row-height))`
                  : undefined,
                zIndex: shouldUseStickyDirectoryHeaders ? 1000 - depth : undefined,
              }}
              onClick={(event) => handleDirectoryClick(event, node.path)}
            >
              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <span className="flex items-center group-hover:hidden">
                {isExpanded ? (
                  <FolderOpen size={16} className="text-github-text-secondary" />
                ) : (
                  <Folder size={16} className="text-github-text-secondary" />
                )}
              </span>
              <span className="hidden items-center pl-[2px] group-hover:flex">
                <Checkbox
                  checked={isReviewed}
                  onChange={() => {
                    onToggleFolderReviewed(node.path, !isReviewed);
                  }}
                  title={
                    isReviewed ? 'Mark all files as not reviewed' : 'Mark all files as reviewed'
                  }
                  className="z-10"
                />
              </span>
              <span
                className={`text-sm text-github-text-primary font-medium flex-1 overflow-hidden text-ellipsis whitespace-nowrap ${
                  isReviewed ? 'line-through text-github-text-muted' : ''
                }`}
                title={node.name}
              >
                {node.name}
              </span>
            </div>
          )}
          {(isExpanded || !node.name) &&
            node.children.map((child) => renderTreeNode(child, node.name ? depth + 1 : depth))}
        </div>
      );
    } else if (node.file) {
      const file = node.file;
      const commentCount = commentCountMap.get(file.path) ?? 0;
      const isReviewed = reviewedFiles.has(file.path);
      const fileIndex = fileIndexMap.get(file.path) ?? -1;
      const isSelected = selectedFileIndex !== null && selectedFileIndex === fileIndex;

      return (
        <div
          key={file.path}
          className={`flex items-center gap-2 px-4 py-2 hover:bg-github-bg-tertiary cursor-pointer transition-colors ${
            isReviewed ? 'opacity-70' : ''
          } ${isSelected ? 'bg-github-bg-tertiary' : ''}`}
          data-file-row="true"
          data-tree-row="true"
          data-depth={depth}
          style={{ paddingLeft: getTreeRowPaddingLeft(depth) }}
          onClick={() => {
            onScrollToFile(file.path);
            onFileSelected?.();
          }}
        >
          <Checkbox
            checked={isReviewed}
            onChange={() => {
              onToggleReviewed(file.path);
            }}
            title={isReviewed ? 'Mark as not reviewed' : 'Mark as reviewed'}
            className="z-10"
          />
          {getFileIcon(node.file.status)}
          <span
            className={`text-sm text-github-text-primary flex-1 overflow-hidden text-ellipsis whitespace-nowrap ${
              isReviewed ? 'line-through text-github-text-muted' : ''
            }`}
            title={node.file.path}
          >
            {node.name}
          </span>
          {commentCount > 0 && (
            <span className="text-github-warning text-sm font-medium ml-auto flex items-center gap-1">
              <MessageSquare size={14} />
              {commentCount}
            </span>
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-github-border bg-github-bg-tertiary">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-github-text-primary m-0">
            Files changed ({files.length})
          </h3>
          <div className="ml-auto flex items-center gap-2">
            <span
              className="inline-flex gap-1 text-right text-xs font-medium whitespace-nowrap"
              title="Total additions and deletions"
              aria-label={`${diffTotals.additions} additions and ${diffTotals.deletions} deletions`}
            >
              <span className="text-github-accent">+{diffTotals.additions}</span>
              <span className="text-github-danger">-{diffTotals.deletions}</span>
            </span>
            <button
              onClick={toggleAllDirectories}
              className="p-1 hover:bg-github-bg-primary rounded transition-colors"
              title={isAllExpanded ? 'Collapse all' : 'Expand all'}
            >
              {isAllExpanded ? (
                <ChevronsDownUp size={16} className="text-github-text-secondary" />
              ) : (
                <ChevronsUpDown size={16} className="text-github-text-secondary" />
              )}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              size={16}
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-github-text-muted"
            />
            <input
              type="text"
              placeholder="Filter files..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              aria-invalid={isFilterInvalid}
              title={
                isFilterInvalid
                  ? 'Invalid regular expression'
                  : 'Filter by text, or wrap in /slashes/ for a regex'
              }
              className={`w-full pl-9 pr-3 py-2 text-sm bg-github-bg-primary border rounded-md focus:outline-none text-github-text-primary placeholder-github-text-muted ${
                isFilterInvalid
                  ? 'border-github-danger focus:border-github-danger'
                  : 'border-github-border focus:border-github-accent'
              }`}
            />
          </div>
          <div
            className="relative z-50"
            ref={filterMenuRef}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setIsFilterMenuOpen(false);
            }}
          >
            <button
              type="button"
              onClick={() => setIsFilterMenuOpen((open) => !open)}
              aria-haspopup="true"
              aria-expanded={isFilterMenuOpen}
              aria-label={hasActiveFilters ? 'Filter files, filters active' : 'Filter files'}
              title="Filter files"
              className={`relative flex items-center justify-center p-2 rounded-md border transition-colors ${
                isFilterMenuOpen
                  ? 'border-github-accent bg-github-bg-primary'
                  : 'border-github-border bg-github-bg-primary hover:bg-github-bg-tertiary'
              }`}
            >
              <Filter size={16} className="text-github-text-secondary" />
              {hasActiveFilters && (
                <span
                  aria-hidden="true"
                  className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-github-accent"
                />
              )}
            </button>

            {isFilterMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-64 rounded-md border border-github-border bg-github-bg-primary shadow-lg">
                {sortedExtensions.length > 0 && (
                  <div className="py-1">
                    <div className="px-3 py-1.5 text-xs font-semibold text-github-text-secondary">
                      File extensions
                    </div>
                    {sortedExtensions.map((extension) => {
                      const label = extension === NO_EXTENSION_KEY ? NO_EXTENSION_LABEL : extension;
                      return (
                        <div
                          key={extension || NO_EXTENSION_LABEL}
                          className="flex items-center justify-between gap-2 px-3 py-1.5 hover:bg-github-bg-tertiary cursor-pointer"
                          onClick={() => toggleExtension(extension)}
                        >
                          <Checkbox
                            checked={!hiddenExtensions.has(extension)}
                            onChange={() => toggleExtension(extension)}
                            label={label}
                            title={label}
                          />
                          <span className="text-xs font-medium text-github-text-muted">
                            {extensionCounts.get(extension)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div
                  className="border-t border-github-border px-3 py-2 hover:bg-github-bg-tertiary cursor-pointer"
                  onClick={() => updateShowViewedFiles(!showViewedFiles)}
                >
                  <Checkbox
                    checked={showViewedFiles}
                    onChange={() => updateShowViewedFiles(!showViewedFiles)}
                    label="Viewed files"
                    title="Viewed files"
                  />
                </div>

                <div className="border-t border-github-border">
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="w-full px-3 py-2 text-left text-sm text-github-accent hover:bg-github-bg-tertiary"
                  >
                    Clear filters
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto relative z-0"
        style={stickyContainerStyle}
        ref={scrollContainerRef}
      >
        {filteredFileTree.children?.map((child) => renderTreeNode(child))}
      </div>
    </div>
  );
});
