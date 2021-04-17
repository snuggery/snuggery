import {parseSyml} from '@yarnpkg/parsers';
import {spawn} from 'child_process';
import {promises as fs} from 'fs';
import {dirname, join, parse as parsePath, resolve} from 'path';
import {Observable} from 'rxjs';
import {map} from 'rxjs/operators';

export interface YarnPlugin {
  name: string;
  builtin: boolean;
}

export interface AppliedVersion {
  cwd: string;
  ident: string;
  oldVersion: string;
  newVersion: string;
}

class Yarn {
  readonly #root: string;
  readonly #yarnPath: string;

  constructor(root: string, yarnPath: string) {
    this.#root = root;
    this.#yarnPath = yarnPath;
  }

  private exec(
    args: string[],
    opts: {
      capture: true;
      quiet?: boolean;
      cwd?: string;
      env?: NodeJS.ProcessEnv;
    },
  ): Observable<string>;
  private exec(
    args: string[],
    opts: {
      capture?: false;
      quiet?: boolean;
      cwd?: string;
      env?: NodeJS.ProcessEnv;
    },
  ): Observable<void>;
  private exec(
    args: string[],
    opts: {
      capture?: boolean;
      quiet?: boolean;
      cwd?: string;
      env?: NodeJS.ProcessEnv;
    },
  ): Observable<string | void>;
  private exec(
    args: string[],
    {
      capture,
      quiet,
      cwd = this.#root,
      env,
    }: {
      capture?: boolean;
      quiet?: boolean;
      cwd?: string;
      env?: NodeJS.ProcessEnv;
    },
  ): Observable<string | void> {
    return new Observable(observer => {
      const child = spawn(process.execPath, [this.#yarnPath, ...args], {
        cwd,
        env: {
          ...process.env,
          ...env,
        },
        stdio: capture
          ? ['ignore', 'pipe', 'ignore']
          : quiet
          ? 'ignore'
          : 'inherit',
      });

      const output: Buffer[] = [];

      child.stdout?.on('data', buffer => output.push(buffer));

      child.addListener('close', (code, signal) => {
        if (signal) {
          observer.error(new Error(`Yarn exited with signal ${signal}`));
        } else if (code) {
          observer.error(new Error(`Yarn exited with exit code ${code}`));
        } else {
          observer.next(Buffer.concat(output).toString('utf8'));
          observer.complete();
        }
      });

      return () => {
        child.kill();
      };
    });
  }

  listPlugins(): Observable<YarnPlugin[]> {
    return this.exec(['plugin', 'runtime', '--json'], {capture: true}).pipe(
      map(output => parseNDJSON<YarnPlugin>(output)),
    );
  }

  applyVersion(): Observable<AppliedVersion[]> {
    return this.exec(['version', 'apply', '--all', '--json'], {
      capture: true,
    }).pipe(
      map(output => {
        const versions = parseNDJSON<AppliedVersion>(output);

        if (versions.length === 0) {
          throw new Error(`No versions found to tag`);
        }

        return versions;
      }),
    );
  }

  snuggeryWorkspacePublish({
    tag,
    cwd,
  }: {
    tag?: string;
    cwd: string;
  }): Observable<void> {
    return this.exec(
      [
        'snuggery-workspace',
        'publish',
        ...(typeof tag === 'string' ? ['--tag', tag] : []),
      ],
      {cwd: resolve(this.#root, cwd)},
    );
  }

  npmPublish({tag, cwd}: {tag?: string; cwd: string}): Observable<void> {
    return this.exec(
      ['npm', 'publish', ...(typeof tag === 'string' ? ['--tag', tag] : [])],
      {cwd: resolve(this.#root, cwd)},
    );
  }
}

export type {Yarn};

export async function loadYarn({root}: {root: string}): Promise<Yarn> {
  const yarnConfigurationPath = await findUp('.yarnrc.yml', root);

  if (!yarnConfigurationPath) {
    throw new Error(`Couldn't find yarn configuration for ${root}`);
  }

  const rawYarnConfiguration = await fs.readFile(yarnConfigurationPath, 'utf8');

  const yarnConfiguration = parseSyml(rawYarnConfiguration);

  if (typeof yarnConfiguration.yarnPath !== 'string') {
    throw new Error(`Couldn't find path to yarn in ${root}`);
  }

  return new Yarn(root, yarnConfiguration.yarnPath);
}

async function findUp(name: string, from: string): Promise<string | null> {
  const root = parsePath(from).root;

  let currentDir = from;
  while (currentDir && currentDir !== root) {
    const p = join(currentDir, name);
    try {
      if ((await fs.stat(p)).isFile()) {
        return p;
      }
    } catch {
      // ignore any error
      // continue to the next folder
    }

    currentDir = dirname(currentDir);
  }

  return null;
}

function parseNDJSON<T>(content: string): T[] {
  return content
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line) as T);
}
