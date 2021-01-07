import type {BuilderOutput} from '@angular-devkit/architect';
import {fork, spawn, ChildProcess, ForkOptions} from 'child_process';
import {extname} from 'path';
import {Observable} from 'rxjs';

import type {Schema} from './schema';

function getResultOfChild(child: ChildProcess): Observable<BuilderOutput> {
  return new Observable(observer => {
    child.addListener('close', (code, signal) => {
      if (signal) {
        observer.next({
          success: false,
          error: `Command exited with signal ${signal}`,
        });
      } else if (code) {
        observer.next({
          success: false,
          error: `Command exited with exit code ${code}`,
        });
      } else {
        observer.next({
          success: true,
        });
      }

      observer.complete();
    });

    return () => child.kill();
  });
}

/**
 * Execute a binary
 *
 * @param cwd The working directory for the spawned process
 * @param binary Path for the binary to spawn
 * @param options Options
 */
export function exec(
  cwd: string,
  binary: string,
  {stdio = 'inherit', env = {}, arguments: args = []}: Schema,
): Observable<BuilderOutput> {
  const childOptions: ForkOptions = {
    cwd,
    stdio,
    env: {
      ...process.env,
      ...env,
    },
  };

  if (/^\.[cm]?js$/.test(extname(binary))) {
    if (Array.isArray(childOptions.stdio)) {
      childOptions.stdio.push('ipc');
    }

    return getResultOfChild(fork(binary, args, childOptions));
  } else {
    return getResultOfChild(spawn(binary, args, childOptions));
  }
}
