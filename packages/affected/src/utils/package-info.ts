import {createHash} from "crypto";
import {promises as fs} from "fs";
import _glob from "glob";
import {dirname, posix, resolve} from "path";
import satisfiesRange from "semver/functions/satisfies.js";
import {promisify} from "util";

const glob = promisify(_glob);

export interface PackageInformation {
	[packageName: string]: {
		location: string;
		workspaceDependencies: Set<string>;
		root?: true;
	};
}

interface PackageManifest {
	name?: string;
	workspaces?: string[];
	version?: string;
	dependencies?: {[dependencyName: string]: string};
	devDependencies?: {[dependencyName: string]: string};
	peerDependencies?: {[dependencyName: string]: string};
}

function getPackageName(path: string, {name}: PackageManifest) {
	if (name != null) {
		return name;
	}

	return createHash("sha256").update(path).digest("base64");
}

export async function getPackageInformation(
	root: string,
): Promise<PackageInformation> {
	let rootManifest: PackageManifest;
	try {
		rootManifest = JSON.parse(
			await fs.readFile(`${root}/package.json`, "utf8"),
		) as unknown as PackageManifest;
	} catch (e) {
		throw new Error(
			`Couldn't parse manifest ${root}/package.json: ${
				(e && (e as Error).message) || (e as string)
			}`,
		);
	}

	const rootPackageName = getPackageName(root, rootManifest);

	const workspaceInfo: PackageInformation = {
		[rootPackageName]: {
			location: root,
			workspaceDependencies: new Set(),
			root: true,
		},
	};

	if (rootManifest.workspaces == null) {
		return workspaceInfo;
	}

	const workspaces = new Map<
		string,
		{manifest: PackageManifest; location: string}
	>();
	workspaces.set(rootPackageName, {manifest: rootManifest, location: root});

	const allWorkspacePaths = new Set(
		(
			await Promise.all(
				rootManifest.workspaces.map((path) =>
					glob(`${path}/package.json`, {cwd: root}),
				),
			)
		)
			.flat()
			.map((p) => resolve(root, p)),
	);

	// Start by reading all package manifests and adding the workspaces to the info object

	for (const workspacePath of allWorkspacePaths) {
		const location = dirname(workspacePath);

		let manifest: PackageManifest;
		try {
			manifest = JSON.parse(
				await fs.readFile(workspacePath, "utf8"),
			) as unknown as PackageManifest;
		} catch (e) {
			throw new Error(
				`Couldn't parse manifest ${workspacePath}: ${
					(e && (e as Error).message) || (e as string)
				}`,
			);
		}

		const name = getPackageName(location, manifest);

		if (workspaces.has(name)) {
			throw new Error(`Duplicate package name: ${name} (${location})`);
		}

		if (Array.isArray(manifest.workspaces)) {
			for (const newWorkspaceLocation of (
				await Promise.all(
					manifest.workspaces.map((path) =>
						glob(`${path}/package.json`, {cwd: location}),
					),
				)
			).flat()) {
				allWorkspacePaths.add(resolve(location, newWorkspaceLocation));
			}
		}

		workspaces.set(name, {manifest, location});
		workspaceInfo[name] = {
			location,
			workspaceDependencies: new Set(),
		};
	}

	// Now loop over the project to set up dependencies

	for (const [packageName, {manifest}] of workspaces) {
		addDependencies(packageName, manifest.dependencies);
		addDependencies(packageName, manifest.peerDependencies);
		addDependencies(packageName, manifest.devDependencies);
	}

	return workspaceInfo;

	function addDependencies(
		packageName: string,
		dependencies?: {[dep: string]: string},
	) {
		if (dependencies == null) {
			return;
		}

		for (const [dependencyName, locator] of Object.entries(dependencies)) {
			const dependencyInfo = workspaces.get(dependencyName);

			if (dependencyInfo == null) {
				continue;
			}

			if (locator === "*" || /^workspace:[*^~]$/.test(locator)) {
				// Wildcard or wildcard workspace protocol
				workspaceInfo[packageName]!.workspaceDependencies.add(dependencyName);
			} else if (
				// Workspace with path
				locator === `workspace:${posix.relative(root, dependencyInfo.location)}`
			) {
				workspaceInfo[packageName]!.workspaceDependencies.add(dependencyName);
			} else if (
				dependencyInfo.manifest.version &&
				satisfiesRange(
					dependencyInfo.manifest.version,
					locator.replace(/^npm:/, ""),
				)
			) {
				// Range matching local version
				workspaceInfo[packageName]!.workspaceDependencies.add(dependencyName);
			}
		}
	}
}
