import path from 'path';
import { env } from '@/lib/config/env';

export function isInScope(absPath) {
  const normalized = path.resolve(absPath);
  return env.scopePaths.some((root) => normalized.startsWith(path.resolve(root)));
}

export function filterInScopePaths(paths) {
  return paths.filter(isInScope);
}
