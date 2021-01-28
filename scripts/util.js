const {npath} = require('@yarnpkg/fslib');
const cp = require('child_process');

exports.exec = function exec(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = cp.spawn(command, args, {
      cwd: npath.fromPortablePath(cwd),
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
};
