import * as snuggery from '@snuggery/snuggery/cli';
import {Filename, PortablePath, npath, ppath} from '@yarnpkg/fslib';
import {Readable, Writable} from 'stream';

const fixtureRoot = npath.toPortablePath(__dirname + '/__fixtures__');

process.env.FORCE_COLOR = 'false';

declare global {
  type JsonValue = string | number | null | boolean | JsonValue[] | JsonObject;
  interface JsonObject {
    [key: string]: JsonValue;
  }

  interface Fixture {
    directory: PortablePath;
    run(
      args: string[],
      options?: {cwd?: string},
    ): Promise<{stdout: string; stderr: string; exitCode: number}>;
    runJson(args: string[], options?: {cwd?: string}): Promise<JsonObject>;
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
        const {exitCode, stdout, stderr} = await run(args, options);

        if (exitCode !== 0) {
          fail(
            `Failed with code ${exitCode}\n== STDOUT: ${stdout}\n== STDERR: ${stderr}`,
          );
        }

        try {
          return JSON.parse(stdout);
        } catch {
          fail(`Invalid JSON: ${JSON.stringify(stdout)}`);
        }
      },
    });
  };
};

class EmptyReadable extends Readable {
  constructor() {
    super({
      read: () => {
        this.push(null);
      },
    });
  }
}

class CollectingWritable extends Writable {
  private readonly buffers: Buffer[] = [];

  constructor() {
    super({
      write: (buff, _encoding, callback) => {
        this.buffers.push(buff);
        callback();
      },
    });
  }

  getContent() {
    return Buffer.concat(this.buffers);
  }
}

function createRunner(dir: PortablePath): Fixture['run'] {
  return async function run(args: string[], options = {}) {
    const startCwd = options.cwd
      ? npath.resolve(npath.fromPortablePath(dir), options.cwd)
      : npath.fromPortablePath(dir);

    const workspace = await snuggery.findWorkspace(startCwd);

    const stdout = new CollectingWritable();
    const stderr = new CollectingWritable();

    const exitCode = await snuggery.run(args, {
      stdin: new EmptyReadable(),
      stdout,
      stderr,
      startCwd,
      workspace,
    });

    return {
      exitCode,
      stdout: stdout.getContent().toString('utf8'),
      stderr: stderr.getContent().toString('utf8'),
    };
  };
}
