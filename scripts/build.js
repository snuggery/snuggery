const {createBuilder} = require('@angular-devkit/architect');
const {xfs, npath, ppath, NodeFS} = require('@yarnpkg/fslib');
const {spawn} = require('child_process');

const root = ppath.dirname(npath.toPortablePath(__dirname));
const dist = ppath.join(root, 'dist');

class FilteredFs extends NodeFS {
  constructor(filter) {
    super();

    this.filter = filter;
  }

  async readdirPromise(p) {
    const original = await super.readdirPromise(p);

    return Promise.all(
      original.map(async f => {
        const resolved = ppath.join(p, f);

        if (
          (await this.statPromise(resolved)).isDirectory() ||
          this.filter.test(resolved)
        ) {
          return f;
        } else {
          return null;
        }
      }),
    ).then(arr => arr.filter(f => f != null));
  }

  async readdirSync(p) {
    const original = super.readdirSync(p);

    return original.filter(f => {
      const resolved = ppath.join(p, f);
      return (
        this.statSync(resolved).isDirectory() || this.filter.test(resolved)
      );
    });
  }
}

module.exports = createBuilder(async function () {
  try {
    await xfs.removePromise(dist, {recursive: true});
    await xfs.mkdirPromise(dist);

    await Promise.all([
      tsc(),

      xfs.copyFilePromise(
        ppath.join(root, 'README.md'),
        ppath.join(dist, 'README.md'),
      ),
      xfs.copyPromise(dist, ppath.join(root, 'src'), {
        baseFs: new FilteredFs(/\.d\.ts$|\.json$/),
      }),

      xfs.readJsonPromise(ppath.join(root, 'package.json')).then(pJson => {
        delete pJson.scripts;
        delete pJson.devDependencies;
        delete pJson.private;
        delete pJson.resolutions;
        delete pJson.workspaces;

        return xfs.writeJsonPromise(ppath.join(dist, 'package.json'), pJson);
      }),
    ]);
  } catch (e) {
    return {
      success: false,
      error: e?.message ?? e,
    };
  }

  return {success: true};
});

function tsc() {
  return new Promise((resolve, reject) => {
    const child = spawn('tsc', {
      cwd: npath.fromPortablePath(root),
      stdio: ['ignore', 'inherit', 'inherit'],
    });

    child.addListener('error', reject);
    child.addListener('close', code => {
      if (code) {
        reject(new Error(`Child exited with code ${code}`));
      } else {
        resolve();
      }
    });
  });
}
