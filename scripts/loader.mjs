import {transform} from "esbuild";
import {readFileSync} from "node:fs";
import {readFile} from "node:fs/promises";
import {isBuiltin} from "node:module";
import {dirname, extname} from "node:path/posix";

const tsToJs = {
	".cts": ".cjs",
	".mts": ".mjs",
	".ts": ".js",
};

const jsToTs = {
	".cjs": ".cts",
	".mjs": ".mts",
	".js": ".ts",
};

const root = dirname(dirname(new URL(import.meta.url).pathname));
/** @type {Map<string, import("node:module").ModuleFormat>} */
const packageFormats = new Map();

/** @param {URL} url */
function getPackageFormat(url) {
	const pkg =
		/^(?:.yarn\/__virtual__\/[^/]+\/1\/)?(integration|packages\/[^/]+)\//.exec(
			url.pathname.slice(root.length + 1),
		)?.[1];

	if (pkg == null) {
		throw new Error(url);
	}

	let format = packageFormats.get(pkg);
	if (format == null) {
		format =
			JSON.parse(readFileSync(new URL(`file://${root}/${pkg}/package.json`)))
				.type ?? "commonjs";
		packageFormats.set(pkg, format);
	}

	return format;
}

/** @type {Set<string>} */
const loadedPackages = new Set();
const preExistingPackages = new Set();

let hasResolvedCli = false;
let traceCli = false;
const start = Date.now();

export async function initialize(data) {
	traceCli = !!data.traceCli;
}

/** @type {import('node:module').ResolveHook} */
export async function resolve(specifier, context, nextResolve) {
	if (specifier === "snuggery:cli-dependencies") {
		return {
			url: specifier,
			shortCircuit: true,
		};
	}

	if (
		traceCli &&
		!specifier.startsWith(".") &&
		!specifier.includes(":") &&
		!isBuiltin(specifier)
	) {
		let slash = specifier.indexOf("/");
		if (specifier.startsWith("@")) {
			slash = specifier.indexOf("/", slash + 1);
		}

		loadedPackages.add(slash > 0 ? specifier.slice(0, slash) : specifier);
		if (!hasResolvedCli) {
			preExistingPackages.add(
				slash > 0 ? specifier.slice(0, slash) : specifier,
			);
		}
	}

	let result;
	try {
		result = await nextResolve(specifier, context);
	} catch (e) {
		if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
			throw e;
		}

		const extension = extname(specifier);
		const tsExtension = jsToTs[extension];
		if (tsExtension == null) {
			throw e;
		}

		try {
			result = await nextResolve(
				specifier.slice(0, -extension.length) + tsExtension,
				context,
			);
		} catch {
			throw e;
		}
	}

	const url = new URL(result.url);
	if (url.protocol !== "file:" || url.pathname.includes("/node_modules/")) {
		return result;
	}

	if (
		!hasResolvedCli &&
		(url.pathname.endsWith("packages/snuggery/src/cli/index.js") ||
			url.pathname.endsWith("packages/snuggery/src/cli/mini.js"))
	) {
		hasResolvedCli = true;
	}

	const extension = extname(url.pathname);
	const jsExtension = tsToJs[extension];

	if (!jsExtension && !(extension in jsToTs)) {
		return result;
	}

	/** @type {import("node:module").ModuleFormat} */
	let format;
	switch (jsExtension ?? extension) {
		case ".mjs":
			format = "module";
			break;
		case ".cjs":
			format = "commonjs";
			break;
		default:
			format = getPackageFormat(url);
	}

	return {
		url: url.href,
		format,
	};
}

/** @type {import('node:module').LoadHook} */
export async function load(urlString, context, nextLoad) {
	if (urlString === "snuggery:cli-dependencies") {
		const allDependencies = Array.from(loadedPackages);
		const newDependencies = allDependencies.filter(
			(pkg) => !preExistingPackages.has(pkg),
		);

		const time = Date.now() - start;

		return {
			shortCircuit: true,
			format: "module",
			source: [
				`export const allDependencies = new Set(${JSON.stringify(
					allDependencies,
				)});`,
				`export const newDependencies = new Set(${JSON.stringify(
					newDependencies,
				)});`,
				`export const time = ${JSON.stringify(time)};`,
				``,
			].join("\n"),
		};
	}

	const url = new URL(urlString);

	if (url.protocol !== "file:" || isBuiltin(urlString)) {
		return await nextLoad(urlString, context);
	}

	const extension = extname(url.pathname);

	if (!(extension in tsToJs)) {
		return nextLoad(urlString, context);
	}

	let {format} = context;
	if (!format) {
		switch (extension) {
			case ".mts":
				format = "module";
				break;
			case ".cts":
				format = "commonjs";
				break;
			default:
				format = getPackageFormat(url);
		}
	}

	const source = await readFile(url);

	return {
		shortCircuit: true,
		format,
		source: (
			await transform(source, {
				sourcefile: urlString,
				platform: "node",
				loader: "ts",
				format: format === "commonjs" ? "cjs" : "esm",
				target: "node20",
				tsconfigRaw: '{"compilerOptions": {"experimentalDecorators": true}}',
			})
		).code,
	};
}
