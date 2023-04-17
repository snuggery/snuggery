import type {Observable} from 'rxjs';

import type {BuilderContext} from './create-builder';

export function firstValueFrom<T>(
	context: BuilderContext,
	observable: Observable<T>,
): Promise<T> {
	return new Promise((resolve, reject) => {
		let isResolved = false;
		const subscription = observable.subscribe({
			next(value) {
				subscription.unsubscribe();
				isResolved = true;
				resolve(value);
			},
			error(err) {
				reject(err);
			},
			complete() {
				if (!isResolved) {
					reject(new Error(`Expected a value but got none`));
				}
			},
		});

		context.addTeardown(() => subscription.unsubscribe());
	});
}

export function lastValueFrom<T>(
	context: BuilderContext,
	observable: Observable<T>,
): Promise<T> {
	return new Promise((resolve, reject) => {
		let hasValue = false;
		let value: T | undefined;
		const subscription = observable.subscribe({
			next(v) {
				hasValue = true;
				value = v;
			},
			error(err) {
				reject(err);
			},
			complete() {
				if (hasValue) {
					resolve(value!);
				} else {
					reject(new Error(`Expected a value but got none`));
				}
			},
		});

		context.addTeardown(() => subscription.unsubscribe());
	});
}
