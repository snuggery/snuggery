import {promises as fs} from 'fs';
import {join, dirname, parse as parsePath} from 'path';

export async function findUp(
  names: string | readonly string[],
  from: string,
): Promise<string | null> {
  if (!Array.isArray(names)) {
    names = [names as string];
  }
  const root = parsePath(from).root;

  let currentDir = from;
  while (currentDir && currentDir !== root) {
    for (const name of names) {
      const p = join(currentDir, name);
      try {
        if ((await fs.stat(p)).isFile()) {
          return p;
        }
      } catch {
        // ignore any error
        // continue to the next filename / folder
      }
    }

    currentDir = dirname(currentDir);
  }

  return null;
}
