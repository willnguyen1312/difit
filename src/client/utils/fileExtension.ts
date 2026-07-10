export const NO_EXTENSION_KEY = '';
export const NO_EXTENSION_LABEL = 'No extension';

export function getFileExtension(path: string): string {
  const basename = path.slice(path.lastIndexOf('/') + 1);
  const dotIndex = basename.lastIndexOf('.');
  if (dotIndex <= 0) return NO_EXTENSION_KEY;
  return basename.slice(dotIndex).toLowerCase();
}
