const realImport = eval('path => import(path)');

export async function dynamicImport(path: string): Promise<any> {
	try {
		return await import(path);
	} catch (e) {
		if (
			e instanceof Error &&
			(e as NodeJS.ErrnoException).code === 'ERR_REQUIRE_ESM'
		) {
			// Guard against the case where the file itself is CommonJS
			// but it wrongfully requires ESM code itself.
			// Loading the file as ESM won't help here. Worse even, it
			// leads to confusing errors.
			if (e.message.includes(`ES Module ${path}`)) {
				return await realImport(path);
			}
		}

		throw e;
	}
}
