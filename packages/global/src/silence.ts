// When using the ESM loader Node.js prints either of the following warnings
//
// - ExperimentalWarning: --experimental-loader is an experimental feature. This feature could change at any time
// - ExperimentalWarning: Custom ESM Loaders is an experimental feature. This feature could change at any time
//
// Having this warning show up once is "fine" but it's also printed
// for each Worker that is created so it ends up spamming stderr.
// Since that doesn't provide any value we suppress the warning.
const originalEmit = process.emit;
// @ts-expect-error - TS complains about the return type of originalEmit.apply
process.emit = function (...args: [string, unknown, ...unknown[]]) {
	if (
		args[0] === 'warning' &&
		args[1] instanceof Error &&
		args[1].name === 'ExperimentalWarning' &&
		(args[1].message.includes('--experimental-loader') ||
			args[1].message.includes('Custom ESM Loaders is an experimental feature'))
	)
		return false;

	// @ts-expect-error TS doesn't really handle overloads and Function.prototype.apply very well
	return originalEmit.apply(process, args);
};
