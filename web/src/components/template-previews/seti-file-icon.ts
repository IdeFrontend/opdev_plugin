export type PreviewEntry = string | {
  name: string;
  depth?: number;
  /** Folder row: collapsed chevron-right, expanded chevron-down (matches VS Code explorer). */
  folder?: 'expanded' | 'collapsed';
};

export type SetiIconKind = 'git' | 'shell' | 'cmake' | 'info' | 'python' | 'c' | 'markdown' | 'default';

export function normalizePreviewEntry(entry: PreviewEntry): {
  name: string;
  depth: number;
  folder?: 'expanded' | 'collapsed';
} {
  if (typeof entry === 'string') {
    return {
      name: entry,
      depth: 0,
    };
  }

  return {
    name: entry.name,
    depth: entry.depth ?? 0,
    folder: entry.folder,
  };
}

export function resolveSetiIconKind(fileName: string): SetiIconKind {
  const lower = fileName.toLowerCase();

  if (lower === 'cmakelists.txt') {
    return 'cmake';
  }

  if (lower === 'readme.md' || lower === 'readme.txt' || lower === 'readme') {
    return 'info';
  }

  if (lower === '.gitignore' || lower.endsWith('.gitignore')) {
    return 'git';
  }

  const dotIndex = lower.lastIndexOf('.');
  const ext = dotIndex >= 0 ? lower.slice(dotIndex + 1) : '';

  switch (ext) {
    case 'sh':
      return 'shell';
    case 'py':
      return 'python';
    case 'asc':
      return 'c';
    case 'md':
      return 'markdown';
    default:
      return 'default';
  }
}
