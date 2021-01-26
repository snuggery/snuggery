import {Filename, PortablePath, npath, ppath, xfs} from '@yarnpkg/fslib';
import {spawn} from 'child_process';

const fixtureRoot = npath.toPortablePath(__dirname + '/__fixtures__');
const atelierMain = npath.resolve(__dirname, '../packages/atelier/dist/bin.js');

if (!xfs.existsSync(npath.toPortablePath(atelierMain))) {
  throw new Error('Built atelier not found, run `yarn ai build atelier` first');
}

declare global {
  type JsonValue = string | number | null | boolean | JsonValue[] | JsonObject;
  interface JsonObject {
    [key: string]: JsonValue;
  }

  interface Fixture {
    directory: PortablePath;
    run(
      args: string[],
      options?: {cwd?: string; env?: NodeJS.ProcessEnv},
    ): Promise<{stdout: string; stderr: string; exitCode: number}>;
    runJson(
      args: string[],
      options?: {cwd?: string; env?: NodeJS.ProcessEnv},
    ): Promise<JsonObject>;
  }

  function inFixture(
    name: string,
    callback: (fixture: Fixture) => void | PromiseLike<void>,
  ): () => Promise<void>;
}

globalThis.inFixture = function inFixture(
  name: string,
  callback: (fixture: Fixture) => PromiseLike<void> | void,
) {
  const fixtureDir = ppath.join(fixtureRoot, name as Filename);
  const run = createRunner(fixtureDir);

  return async () => {
    await callback({
      directory: fixtureDir,
      run,
      runJson: async (args, options) => {
        const {exitCode, stdout} = await run(args, options);

        expect(exitCode).toBe(0);

        try {
          return JSON.parse(stdout);
        } catch {
          fail(`Invalid JSON: ${JSON.stringify(stdout)}`);
        }
      },
    });
  };
};

function createRunner(dir: PortablePath): Fixture['run'] {
  return function run(args: string[], options = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(process.argv0, [atelierMain, ...args], {
        cwd: options.cwd
          ? npath.resolve(npath.fromPortablePath(dir), options.cwd)
          : npath.fromPortablePath(dir),
        env: {
          NO_COLOR: '1',
          ...(options.env ?? process.env),
          ATELIER_TEST: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];

      child.stdout.addListener('data', buff => stdout.push(buff));
      child.stderr.addListener('data', buff => stderr.push(buff));

      child.on('error', reject);
      child.on('close', exitCode => {
        resolve({
          exitCode,
          stdout: Buffer.concat(stdout).toString(),
          stderr: Buffer.concat(stderr).toString(),
        });
      });
    });
  };
}
