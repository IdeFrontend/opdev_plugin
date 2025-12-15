import path from 'path';

export function getResourcePath(relativePath: string) {
  const base = path.resolve(__dirname, '../../');
  return path.join(base, relativePath);
}
