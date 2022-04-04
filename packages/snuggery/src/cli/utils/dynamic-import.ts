const realImport = eval('path => import(path)');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function dynamicImport(path: string): Promise<any> {
	try {
		return await import(path);
	} catch (e) {
		if (
			e instanceof Error &&
			(e as NodeJS.ErrnoException).code === 'ERR_REQUIRE_ESM'
		) {
			return await realImport(path);
		}

		throw e;
	}
}
