import {createRequire} from "node:module";
import {pathToFileURL} from "node:url";

const require = createRequire(import.meta.url);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function dynamicImport(path: string): Promise<any> {
	// Import requires valid (partial) URLs, e.g. `./lorem` or `/ipsum`,
	// but absolute DOS-style paths aren't valid: D:/dolor or even D:\sit,
	// so pass it through pathToFileURL
	return await import(pathToFileURL(require.resolve(path)).href);
}
