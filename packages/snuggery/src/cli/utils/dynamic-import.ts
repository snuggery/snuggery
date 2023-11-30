import {pathToFileURL} from "url";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function dynamicImport(path: string): Promise<any> {
	try {
		return require(path);
	} catch (e) {
		if (
			e instanceof Error &&
			(e as NodeJS.ErrnoException).code === "ERR_REQUIRE_ESM"
		) {
			// Import requires valid (partial) URLs, e.g. `./lorem` or `/ipsum`,
			// but absolute DOS-style paths aren't valid: D:/dolor or even D:\sit
			return await import(pathToFileURL(path).href);
		}

		throw e;
	}
}
