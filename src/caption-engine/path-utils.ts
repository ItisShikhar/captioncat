import path from 'node:path';

export function toFsPath(inputPath: string): string {
  const resolvedPath = path.resolve(inputPath);

  if (process.platform !== 'win32') {
    return resolvedPath;
  }

  if (resolvedPath.startsWith('\\\\?\\')) {
    return resolvedPath;
  }

  if (resolvedPath.startsWith('\\\\')) {
    return resolvedPath;
  }

  if (resolvedPath.length < 240) {
    return resolvedPath;
  }

  return `\\\\?\\${resolvedPath}`;
}
