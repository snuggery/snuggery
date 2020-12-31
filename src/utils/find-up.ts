import {existsSync} from 'fs';
import {join, dirname, parse as parsePath} from 'path';

export function findUp(names: string | string[], from: string) {
  if (!Array.isArray(names)) {
    names = [names];
  }
  const root = parsePath(from).root;

  let currentDir = from;
  while (currentDir && currentDir !== root) {
    for (const name of names) {
      const p = join(currentDir, name);
      if (existsSync(p)) {
        return p;
      }
    }

    currentDir = dirname(currentDir);
  }

  return null;
}
