import {
	PerformanceObserver,
	performance as _realPerformance,
} from 'node:perf_hooks';
import process from 'node:process';

/** @type {Pick<import('node:perf_hooks').Performance, 'mark' | 'measure' | 'clearMarks'>} */
export const performance = process.env.SNUGGERY_PERF
	? _realPerformance
	: {
			mark() {
				// no-op
			},
			clearMarks() {
				// no-op
			},
			measure() {
				// no-op
			},
	  };

if (performance === _realPerformance) {
	/** @type {Map<string, number>} */
	const timings = new Map();
	/** @type {Map<string, number>} */
	const cacheRequests = new Map();
	/** @type {Map<string, number>} */
	const cacheMisses = new Map();

	const measurementObserver = new PerformanceObserver(list => {
		for (const entry of list.getEntries()) {
			timings.set(entry.name, (timings.get(entry.name) ?? 0) + entry.duration);
		}
	});

	const cacheObserver = new PerformanceObserver(list => {
		for (const entry of list.getEntries()) {
			if (entry.name.startsWith('cache:')) {
				const name = entry.name.slice('cache:'.length).trimStart();
				cacheRequests.set(name, (cacheRequests.get(name) ?? 0) + 1);
			} else if (entry.name.startsWith('cache miss:')) {
				const name = entry.name.slice('cache miss:'.length).trimStart();
				cacheMisses.set(name, (cacheMisses.get(name) ?? 0) + 1);
			}
		}
	});

	measurementObserver.observe({entryTypes: ['measure'], buffered: true});
	cacheObserver.observe({entryTypes: ['mark'], buffered: true});

	process.once('exit', () => {
		measurementObserver.disconnect();
		cacheObserver.disconnect();

		if (cacheRequests.size > 0) {
			console.log('\nCaches:');
			for (const [name, requests] of cacheRequests) {
				const misses = cacheMisses.get(name) ?? 0;
				console.log(`- ${name}:`);
				console.log(`  - hits:   ${requests - misses}`);
				console.log(`  - misses: ${misses}`);
			}
		}

		if (timings.size === 0) {
			return;
		}

		const longestNameLength = Array.from(
			timings.keys(),
			name => name.length,
		).reduce((a, b) => Math.max(a, b));

		console.log('\nTimings:');
		for (const [name, duration] of timings) {
			let [whole, decimals] = /** @type {[string, string | undefined]} */ (
				String(duration).split('.', 2)
			);

			whole = whole.padStart(7);
			const pretty = decimals ? `${whole}.${decimals.slice(0, 3)}` : whole;

			console.log(`- ${name.padEnd(longestNameLength)} : ${pretty}`);
		}
	});
}
