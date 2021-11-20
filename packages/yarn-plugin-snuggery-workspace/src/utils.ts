import {
	Descriptor,
	Manifest,
	semverUtils,
	structUtils,
	tgzUtils,
	Workspace,
} from '@yarnpkg/core';
import {CwdFS, xfs} from '@yarnpkg/fslib';
import {suggestUtils} from '@yarnpkg/plugin-essentials';
import * as semver from 'semver';

export function createPublishWorkspace(
	workspace: Workspace,
	cwd: Workspace['cwd'],
	rawManifest: Manifest['raw'],
): Workspace {
	return Object.create(workspace, {
		cwd: {
			value: cwd,
			writable: false,
			configurable: true,
		},

		manifest: {
			value: Manifest.fromText(JSON.stringify(rawManifest)),
			writable: false,
			configurable: true,
		},
	});
}

export function getManifestFromTarball(buffer: Buffer): Promise<Manifest> {
	return xfs.mktempPromise(async folder => {
		const fs = new CwdFS(folder);
		await tgzUtils.extractArchiveTo(buffer, fs, {stripComponents: 1});

		return Manifest.fromText(
			await fs.readFilePromise(Manifest.fileName, 'utf8'),
		);
	});
}

const npmProtocol = 'npm:';

export function getModifier({range}: Descriptor): suggestUtils.Modifier {
	if (range.startsWith(npmProtocol)) {
		range = range.slice(npmProtocol.length);
	}

	if (
		/^[a-z]+:/.test(range) ||
		range.includes('||') ||
		range.includes('&&') ||
		!semverUtils.validRange(range)
	) {
		return suggestUtils.Modifier.EXACT;
	}

	switch (range[0]) {
		case '^':
			return suggestUtils.Modifier.CARET;
		case '~':
			return suggestUtils.Modifier.TILDE;
		default:
			return suggestUtils.Modifier.EXACT;
	}
}

export function applyModifier(
	descriptor: Descriptor,
	sourceModifier: Descriptor,
): Descriptor {
	const modifier = getModifier(sourceModifier);

	if (modifier !== suggestUtils.Modifier.EXACT) {
		return suggestUtils.applyModifier(descriptor, modifier);
	}

	// Used in angular for certain "unstable" packages: >= 0.XXXX.YY < 0.ZZZZ.0
	// where XXXX is AA + BB and ZZZZ is (AA + 1) + 00

	const {protocol, source, selector, params} = structUtils.parseRange(
		descriptor.range,
	);

	const angularRangeMatch =
		/^\s*>=\s*0\.(\d\d)\d\d(?:.[^ <]+)?\s*<\s*0\.(\d\d)00(?:\.0)?\s*$/.exec(
			sourceModifier.range,
		);
	const versionMatch = /^0\.(\d\d)\d\d(?:\.\d+)?$/.exec(selector);
	if (
		semver.valid(selector) &&
		versionMatch != null &&
		angularRangeMatch != null &&
		+angularRangeMatch[2]! === +angularRangeMatch[1]! + 1
	) {
		return structUtils.makeDescriptor(
			descriptor,
			structUtils.makeRange({
				protocol,
				source,
				selector: `>= ${selector} < 0.${versionMatch[1]}00.0`,
				params,
			}),
		);
	}

	return descriptor;
}
