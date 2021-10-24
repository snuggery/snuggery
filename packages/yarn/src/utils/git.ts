import {spawn} from 'child_process';
import {Observable} from 'rxjs';

export function git(args: string[], {root}: {root: string}): Observable<void> {
	return new Observable(observer => {
		const child = spawn('git', args, {
			cwd: root,
			env: process.env,
			stdio: 'inherit',
		});

		child.addListener('close', (code, signal) => {
			if (signal) {
				observer.error(new Error(`Git exited with signal ${signal}`));
			} else if (code) {
				observer.error(new Error(`Git exited with exit code ${code}`));
			} else {
				observer.next(undefined);
				observer.complete();
			}
		});

		return () => {
			child.kill();
		};
	});
}
