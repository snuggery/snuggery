import type {PathFragment} from "@angular-devkit/core";
import type {DirEntry, Tree} from "@angular-devkit/schematics";
import {matchesPatterns} from "@snuggery/core";
import mkIgnore from "ignore";
import {join} from "node:path/posix";

export function* walkTree(
	tree: Tree,
	{
		include = "**/*",
		exclude,
	}: {include?: string | string[]; exclude?: string | string[]} = {},
): Generator<string> {
	const pattern = {include, exclude};
	if (Array.isArray(pattern.exclude) && pattern.exclude.length === 0) {
		pattern.exclude = undefined;
	}

	for (const path of walkDir(tree.root, () => false)) {
		if (matchesPatterns(path, pattern)) {
			yield path;
		}
	}
}

const ignoreFile = ".gitignore" as PathFragment;

function* walkDir(
	dir: DirEntry,
	ignore: (path: string) => boolean,
): Generator<string> {
	const gitignore = dir.file(ignoreFile);
	if (gitignore != null) {
		const localIgnore = mkIgnore().add(
			gitignore.content.toString().split(/\r?\n/),
		);

		const parentIgnore = ignore;
		ignore = (path) => parentIgnore(path) || localIgnore.ignores(path);
	}

	for (const file of dir.subfiles) {
		if (ignore(file)) {
			continue;
		}

		yield file;
	}

	/* cspell:word subdir */
	for (const subdir of dir.subdirs) {
		if (ignore(subdir)) {
			continue;
		}

		for (const file of walkDir(dir.dir(subdir)!, (path) =>
			ignore(join(subdir, path)),
		)) {
			yield join(subdir, file);
		}
	}
}
