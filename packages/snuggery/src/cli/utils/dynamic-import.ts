import {createRequire} from "node:module";
import {pathToFileURL} from "node:url";

const require = createRequire(import.meta.url);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function dynamicImport(path: string): Promise<any> {
	try {
		// Import requires valid (partial) URLs, e.g. `./lorem` or `/ipsum`,
		// but absolute DOS-style paths aren't valid: D:/dolor or even D:\sit
		return await import(pathToFileURL(path).href);
	} catch (e) {
		if (
			e instanceof Error &&
			(e as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND"
		) {
			return require(path);
		}

		throw e;
	}
}
