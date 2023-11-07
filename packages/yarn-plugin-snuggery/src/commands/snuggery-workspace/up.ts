import {BaseCommand, WorkspaceRequiredError} from '@yarnpkg/cli';
import {
	structUtils,
	Project,
	StreamReport,
	Workspace,
	Cache,
	Configuration,
	Descriptor,
	LightReport,
	MessageName,
	formatUtils,
	InstallMode,
	DescriptorHash,
	Package,
	Locator,
	IdentHash,
} from '@yarnpkg/core';
import {Filename, ppath, xfs} from '@yarnpkg/fslib';
import {suggestUtils, Hooks} from '@yarnpkg/plugin-essentials';
import {npmHttpUtils} from '@yarnpkg/plugin-npm';
import {Option, UsageError} from 'clipanion';
import * as semver from 'semver';

import {applyModifier, getModifier} from '../../utils';

const migrationFilename = 'migrations.json' as Filename;

export class UpCommand extends BaseCommand {
	static override paths = [['snuggery-workspace', `up`]];

	patterns = Option.Rest();

	async execute(): Promise<number> {
		const configuration = await Configuration.find(
			this.context.cwd,
			this.context.plugins,
		);
		const {project, workspace} = await Project.find(
			configuration,
			this.context.cwd,
		);
		const cache = await Cache.find(configuration);

		if (!workspace) {
			throw new WorkspaceRequiredError(project.cwd, this.context.cwd);
		}

		await project.restoreInstallState();

		const strategies = [
			suggestUtils.Strategy.PROJECT,
			suggestUtils.Strategy.LATEST,
		];

		const allSuggestionsPromises = [];
		const unreferencedPatterns = [];

		const defaultProtocol = configuration.get('defaultProtocol');

		const resolveDescriptor = (descriptor: Descriptor) => {
			const range = structUtils.parseRange(descriptor.range);

			if (!range.protocol) {
				range.protocol = defaultProtocol;
				descriptor = structUtils.makeDescriptor(
					descriptor,
					structUtils.makeRange(range),
				);
			}

			const locator = project.storedResolutions.get(descriptor.descriptorHash);

			if (locator == null) {
				throw new Error(
					`Assertion failed: expected ${structUtils.stringifyDescriptor(
						descriptor,
					)} to be resolved`,
				);
			}

			const pkg = project.storedPackages.get(locator);

			if (!pkg) {
				throw new Error(
					`Assertion failed: expected ${structUtils.stringifyDescriptor(
						descriptor,
					)} to be installed, try running an installation`,
				);
			}

			return pkg;
		};

		for (const pattern of this.patterns) {
			let isReferenced = false;

			// The range has to be static
			const descriptor = structUtils.parseDescriptor(pattern);

			for (const workspace of project.workspaces) {
				for (const target of [
					suggestUtils.Target.REGULAR,
					suggestUtils.Target.DEVELOPMENT,
				]) {
					if (
						!workspace.manifest.getForScope(target).has(descriptor.identHash)
					) {
						continue;
					}

					const existingDescriptor = workspace.manifest[target].get(
						descriptor.identHash,
					);
					if (typeof existingDescriptor === `undefined`)
						throw new Error(
							`Assertion failed: Expected the descriptor to be registered`,
						);

					allSuggestionsPromises.push(
						Promise.resolve().then(async () => {
							return [
								workspace,
								target,
								existingDescriptor,
								await suggestUtils.getSuggestedDescriptors(descriptor, {
									project,
									workspace,
									cache,
									target,
									modifier: getModifier(descriptor),
									strategies,
									fixed: true,
								}),
							] as const;
						}),
					);

					isReferenced = true;
				}
			}

			if (!isReferenced) {
				unreferencedPatterns.push(pattern);
			}
		}

		if (unreferencedPatterns.length > 1) {
			throw new UsageError(
				`Patterns ${formatUtils.prettyList(
					configuration,
					unreferencedPatterns,
					formatUtils.Type.CODE,
				)} don't match any packages referenced by any workspace`,
			);
		}
		if (unreferencedPatterns.length > 0) {
			throw new UsageError(
				`Pattern ${formatUtils.prettyList(
					configuration,
					unreferencedPatterns,
					formatUtils.Type.CODE,
				)} doesn't match any packages referenced by any workspace`,
			);
		}

		const allSuggestions = await Promise.all(allSuggestionsPromises);

		const checkReport = await LightReport.start(
			{
				configuration,
				stdout: this.context.stdout,
				suggestInstall: false,
			},
			async report => {
				for (const [
					,
					,
					// workspace
					// target
					existing,
					{suggestions, rejections},
				] of allSuggestions) {
					const nonNullSuggestions = suggestions.filter(suggestion => {
						return suggestion.descriptor !== null;
					});

					if (nonNullSuggestions.length === 0) {
						const [firstError] = rejections;
						if (typeof firstError === `undefined`)
							throw new Error(
								`Assertion failed: Expected an error to have been set`,
							);

						const prettyError = this.cli.error(firstError);

						if (!project.configuration.get(`enableNetwork`)) {
							report.reportError(
								MessageName.CANT_SUGGEST_RESOLUTIONS,
								`${structUtils.prettyDescriptor(
									configuration,
									existing,
								)} can't be resolved to a satisfying range (note: network resolution has been disabled)\n\n${prettyError}`,
							);
						} else {
							report.reportError(
								MessageName.CANT_SUGGEST_RESOLUTIONS,
								`${structUtils.prettyDescriptor(
									configuration,
									existing,
								)} can't be resolved to a satisfying range\n\n${prettyError}`,
							);
						}
					} else if (nonNullSuggestions.length > 1) {
						report.reportError(
							MessageName.CANT_SUGGEST_RESOLUTIONS,
							`${structUtils.prettyDescriptor(
								configuration,
								existing,
							)} has multiple possible upgrade strategies; are you trying to update a local package?`,
						);
					}
				}
			},
		);

		if (checkReport.hasErrors()) {
			return checkReport.exitCode();
		}

		const afterWorkspaceDependencyReplacementList: [
			Workspace,
			suggestUtils.Target,
			Descriptor,
			Descriptor,
		][] = [];

		const resolver = configuration.makeResolver();
		const updateGroups = new Map<DescriptorHash, readonly Descriptor[]>();

		const migrations = new Map<Package, Descriptor>();

		const getManifest = async (locator: Locator | Package) => {
			const registryData = await npmHttpUtils.get(
				npmHttpUtils.getIdentUrl(locator),
				{
					configuration,
					ident: locator,
					jsonResponse: true,
				},
			);

			const version =
				'version' in locator && locator.version
					? locator.version
					: semver.clean(structUtils.parseRange(locator.reference).selector);

			const versionInfo = registryData.versions[version!];

			if (versionInfo == null) {
				throw new Error(
					`Assertion failed: version ${version} not found in registry`,
				);
			}

			return versionInfo;
		};

		const performUpdateReport = await LightReport.start(
			{
				configuration,
				stdout: this.context.stdout,
				suggestInstall: false,
			},
			async report => {
				for (const [
					workspace,
					target /*existing*/,
					,
					{suggestions},
				] of allSuggestions) {
					const selected = suggestions.find(
						suggestion => suggestion.descriptor != null,
					)!.descriptor!;
					const current = workspace.manifest[target].get(selected.identHash);

					if (typeof current === `undefined`) {
						throw new Error(
							`Assertion failed: This descriptor should have a matching entry`,
						);
					}

					if (current.descriptorHash === selected.descriptorHash) {
						continue;
					}
					let updateGroup = updateGroups.get(selected.descriptorHash);

					if (updateGroup == null) {
						const candidates = await resolver.getCandidates(
							selected,
							{},
							{
								project,
								report,
								resolver,
							},
						);

						if (candidates.length === 0) {
							throw new Error(`Assertion failed: candidate has to be found`);
						}

						const manifest = await getManifest(candidates[0]!);
						const rawUpdateGroup = manifest['ng-update']?.packageGroup;

						if (Array.isArray(rawUpdateGroup)) {
							updateGroup = rawUpdateGroup.map(ident =>
								structUtils.makeDescriptor(
									structUtils.parseIdent(ident),
									selected.range,
								),
							);
						} else if (
							typeof rawUpdateGroup === 'object' &&
							rawUpdateGroup != null
						) {
							updateGroup = Object.entries(rawUpdateGroup).map(
								([ident, range]) =>
									structUtils.makeDescriptor(
										structUtils.parseIdent(ident),
										`${range}`,
									),
							);
						} else {
							updateGroup = [selected];
						}

						for (const {descriptorHash} of updateGroup) {
							updateGroups.set(descriptorHash, updateGroup);
						}
					}

					for (const descriptor of updateGroup) {
						const previousDescriptor = workspace.manifest[target].get(
							descriptor.identHash,
						);

						if (previousDescriptor == null) {
							continue;
						}

						workspace.manifest[target].set(descriptor.identHash, descriptor);

						const peerDescriptor = workspace.manifest.peerDependencies.get(
							descriptor.identHash,
						);
						if (peerDescriptor != null) {
							workspace.manifest.peerDependencies.set(
								descriptor.identHash,
								applyModifier(descriptor, peerDescriptor),
							);
						}

						afterWorkspaceDependencyReplacementList.push([
							workspace,
							target,
							previousDescriptor,
							descriptor,
						]);

						migrations.set(resolveDescriptor(previousDescriptor), descriptor);
					}
				}
			},
		);

		if (performUpdateReport.hasErrors()) {
			return performUpdateReport.exitCode();
		}

		await configuration.triggerMultipleHooks(
			(hooks: Hooks) => hooks.afterWorkspaceDependencyReplacement,
			afterWorkspaceDependencyReplacementList,
		);

		const installReport = await StreamReport.start(
			{
				configuration,
				stdout: this.context.stdout,
			},
			async report => {
				await project.install({
					cache,
					report,
					mode: InstallMode.UpdateLockfile,
				});

				await report.startTimerPromise('Preparing migration', async () => {
					const migrationFile = ppath.join(project.cwd, migrationFilename);

					const migrationMap = new Map<
						IdentHash,
						{
							package: string;
							from: string;
							to: string;

							includedMigrations?: string[];
							skippedMigrations?: string[];
						}
					>();

					if (await xfs.existsPromise(migrationFile)) {
						for (const item of await xfs.readJsonPromise(migrationFile)) {
							migrationMap.set(
								structUtils.parseIdent(item.package).identHash,
								item,
							);
						}
					}

					for (const [oldPackage, newDescriptor] of migrations) {
						const newPackage = resolveDescriptor(newDescriptor);
						const name = structUtils.stringifyIdent(oldPackage);

						if (!(await getManifest(newPackage))['ng-update']?.migrations) {
							continue;
						}

						let migration = migrationMap.get(oldPackage.identHash);

						if (migration != null) {
							if (
								oldPackage.version &&
								semver.lt(oldPackage.version, migration.from)
							) {
								migration.from = oldPackage.version;

								delete migration.includedMigrations;
								delete migration.skippedMigrations;
							}

							if (
								newPackage.version &&
								semver.gt(newPackage.version, migration.to)
							) {
								migration.to = newPackage.version;

								delete migration.includedMigrations;
								delete migration.skippedMigrations;
							}
						} else {
							migration = {
								package: name,

								from: oldPackage.version ?? 'unknown',
								to: newPackage.version ?? 'unknown',
							};

							migrationMap.set(oldPackage.identHash, migration);
						}
					}

					if (migrationMap.size) {
						await xfs.writeJsonPromise(
							migrationFile,
							Array.from(migrationMap.values()),
						);
					}

					report.reportInfo(
						null,
						`Changes have been made to the ${formatUtils.pretty(
							configuration,
							Filename.manifest,
							formatUtils.Type.PATH,
						)} files and to ${formatUtils.pretty(
							configuration,
							Filename.lockfile,
							formatUtils.Type.PATH,
						)} and the new packages have been downloaded, but no packages have been installed yet into ${formatUtils.pretty(
							configuration,
							Filename.nodeModules,
							formatUtils.Type.PATH,
						)} or ${formatUtils.pretty(
							configuration,
							Filename.pnpCjs,
							formatUtils.Type.PATH,
						)}.`,
					);
					report.reportInfo(
						null,
						`You can add extra migrations by executing ${formatUtils.pretty(
							configuration,
							'`yarn sn run update <package@version> [...package@version]`',
							formatUtils.Type.CODE,
						)} again.`,
					);
					report.reportInfo(
						null,
						'If you are ready to apply the update, continue with the instructions below.',
					);
					report.reportInfo(
						null,
						`First, check whether everything looks okay and perform the actual installation via ${formatUtils.pretty(
							configuration,
							'`yarn install`',
							formatUtils.Type.CODE,
						)}`,
					);
					if (migrationMap.size) {
						report.reportInfo(
							null,
							`Then, continue with executing the migrations. Run ${formatUtils.pretty(
								configuration,
								'`yarn sn help update`',
								formatUtils.Type.CODE,
							)} for instructions.`,
						);
					}
				});
			},
		);

		return installReport.exitCode();
	}
}
