import { fireEvent, render, screen, within } from '@testing-library/react';
import { type ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';

import type { DiffFile } from '../../types/diff';

import { FileList } from './FileList';

const createFile = (
  path: string,
  totals: { additions?: number; deletions?: number } = {},
): DiffFile => ({
  path,
  status: 'modified',
  additions: totals.additions ?? 1,
  deletions: totals.deletions ?? 1,
  chunks: [],
});

function getTreeRow(title: string): HTMLElement {
  const row = screen.getByTitle(title).closest<HTMLElement>('[data-tree-row="true"]');
  expect(row).not.toBeNull();
  return row as HTMLElement;
}

function getLabel(title: string): HTMLElement {
  return screen.getByTitle(title);
}

describe('FileList', () => {
  it('renders total additions and deletions beside the file count', () => {
    render(
      <FileList
        files={[
          createFile('README.md', { additions: 3, deletions: 1 }),
          createFile('src/client/App.tsx', { additions: 2, deletions: 4 }),
        ]}
        onScrollToFile={vi.fn()}
        comments={[]}
        reviewedFiles={new Set()}
        onToggleReviewed={vi.fn()}
        onToggleFolderReviewed={vi.fn()}
        selectedFileIndex={null}
      />,
    );

    expect(screen.getByText('Files changed (2)')).toBeInTheDocument();
    expect(screen.getByLabelText('5 additions and 5 deletions')).toBeInTheDocument();
    expect(screen.getByText('+5')).toBeInTheDocument();
    expect(screen.getByText('-5')).toBeInTheDocument();
  });

  it('strikes through directories when all descendant files are reviewed', () => {
    const files = [
      createFile('src/cli/index.ts'),
      createFile('src/client/App.tsx'),
      createFile('README.md'),
    ];
    const props = {
      files,
      onScrollToFile: vi.fn(),
      comments: [],
      onToggleReviewed: vi.fn(),
      onToggleFolderReviewed: vi.fn(),
      selectedFileIndex: null,
    };
    const { rerender } = render(
      <FileList {...props} reviewedFiles={new Set(['README.md', 'src/cli/index.ts'])} />,
    );

    expect(getLabel('src')).not.toHaveClass('line-through');
    expect(getTreeRow('src')).not.toHaveClass('opacity-70');
    expect(getLabel('cli')).toHaveClass('line-through');
    expect(getTreeRow('cli')).toHaveClass('opacity-70');
    expect(getLabel('client')).not.toHaveClass('line-through');
    expect(getTreeRow('client')).not.toHaveClass('opacity-70');

    rerender(
      <FileList
        {...props}
        reviewedFiles={new Set(['README.md', 'src/cli/index.ts', 'src/client/App.tsx'])}
      />,
    );

    expect(getLabel('src')).toHaveClass('line-through');
    expect(getTreeRow('src')).toHaveClass('opacity-70');
    expect(getLabel('cli')).toHaveClass('line-through');
    expect(getTreeRow('cli')).toHaveClass('opacity-70');
    expect(getLabel('client')).toHaveClass('line-through');
    expect(getTreeRow('client')).toHaveClass('opacity-70');
  });

  it('marks all files in a folder as reviewed via the directory checkbox', () => {
    const onToggleFolderReviewed = vi.fn();
    render(
      <FileList
        files={[
          createFile('src/cli/index.ts'),
          createFile('src/client/App.tsx'),
          createFile('README.md'),
        ]}
        onScrollToFile={vi.fn()}
        comments={[]}
        reviewedFiles={new Set()}
        onToggleReviewed={vi.fn()}
        onToggleFolderReviewed={onToggleFolderReviewed}
        selectedFileIndex={null}
      />,
    );

    const checkbox = within(getTreeRow('src')).getByRole('checkbox');
    expect(checkbox).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(checkbox);
    expect(onToggleFolderReviewed).toHaveBeenCalledWith('src', true);
  });

  it('unmarks all files in a fully reviewed folder via the directory checkbox', () => {
    const onToggleFolderReviewed = vi.fn();
    render(
      <FileList
        files={[createFile('src/cli/index.ts'), createFile('src/client/App.tsx')]}
        onScrollToFile={vi.fn()}
        comments={[]}
        reviewedFiles={new Set(['src/cli/index.ts', 'src/client/App.tsx'])}
        onToggleReviewed={vi.fn()}
        onToggleFolderReviewed={onToggleFolderReviewed}
        selectedFileIndex={null}
      />,
    );

    const checkbox = within(getTreeRow('src')).getByRole('checkbox');
    expect(checkbox).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(checkbox);
    expect(onToggleFolderReviewed).toHaveBeenCalledWith('src', false);
  });
});

describe('FileList filter dropdown', () => {
  const dropdownFiles = [
    createFile('src/a.tsx'),
    createFile('src/b.tsx'),
    createFile('src/c.ts'),
    createFile('src/d.ts'),
    createFile('src/e.ts'),
    createFile('README.md'),
  ];

  function renderFileList(overrides: Partial<ComponentProps<typeof FileList>> = {}) {
    const props: ComponentProps<typeof FileList> = {
      files: dropdownFiles,
      onScrollToFile: vi.fn(),
      comments: [],
      reviewedFiles: new Set<string>(),
      onToggleReviewed: vi.fn(),
      onToggleFolderReviewed: vi.fn(),
      selectedFileIndex: null,
      ...overrides,
    };
    return render(<FileList {...props} />);
  }

  function openFilterMenu() {
    fireEvent.click(screen.getByRole('button', { name: /filter files/i }));
  }

  it('lists file extensions with counts when the filter menu is opened', () => {
    renderFileList();

    expect(screen.queryByText('File extensions')).not.toBeInTheDocument();

    openFilterMenu();

    expect(screen.getByText('File extensions')).toBeVisible();
    expect(screen.getByRole('checkbox', { name: '.tsx' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('checkbox', { name: '.ts' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('checkbox', { name: '.md' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('2')).toBeVisible();
    expect(screen.getByText('3')).toBeVisible();
    expect(screen.getByText('1')).toBeVisible();
  });

  it('hides files of an extension when its checkbox is unchecked', () => {
    renderFileList();
    openFilterMenu();

    fireEvent.click(screen.getByRole('checkbox', { name: '.tsx' }));

    expect(screen.queryByTitle('src/a.tsx')).not.toBeInTheDocument();
    expect(screen.queryByTitle('src/b.tsx')).not.toBeInTheDocument();
    expect(screen.getByTitle('src/c.ts')).toBeVisible();
    expect(screen.getByTitle('README.md')).toBeVisible();
    expect(screen.getByRole('checkbox', { name: '.tsx' })).toHaveAttribute('aria-checked', 'false');
  });

  it('hides reviewed files when Viewed files is unchecked', () => {
    renderFileList({ reviewedFiles: new Set(['src/a.tsx', 'src/c.ts']) });
    openFilterMenu();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Viewed files' }));

    expect(screen.queryByTitle('src/a.tsx')).not.toBeInTheDocument();
    expect(screen.queryByTitle('src/c.ts')).not.toBeInTheDocument();
    expect(screen.getByTitle('src/b.tsx')).toBeVisible();
    expect(screen.getByTitle('README.md')).toBeVisible();
  });

  it('resets text and extension filters via Clear filters', () => {
    renderFileList();

    fireEvent.change(screen.getByPlaceholderText('Filter files...'), {
      target: { value: 'a.tsx' },
    });
    openFilterMenu();
    fireEvent.click(screen.getByRole('checkbox', { name: '.ts' }));

    expect(screen.queryByTitle('README.md')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(screen.getByPlaceholderText('Filter files...')).toHaveValue('');
    expect(screen.getByTitle('src/a.tsx')).toBeVisible();
    expect(screen.getByTitle('src/c.ts')).toBeVisible();
    expect(screen.getByTitle('README.md')).toBeVisible();
    expect(screen.getByRole('checkbox', { name: '.ts' })).toHaveAttribute('aria-checked', 'true');
  });

  it('marks the filter button active when a filter is applied', () => {
    renderFileList();

    expect(screen.getByRole('button', { name: 'Filter files' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /filters active/i })).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Filter files...'), {
      target: { value: '.md' },
    });

    expect(screen.getByRole('button', { name: /filters active/i })).toBeInTheDocument();
  });
});
