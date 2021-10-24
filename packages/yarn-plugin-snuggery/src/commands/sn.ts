import {BaseCommand} from '@yarnpkg/cli';
import {Configuration, Project, scriptUtils, structUtils} from '@yarnpkg/core';
import {Option} from 'clipanion';

export class SnCommand extends BaseCommand {
	static paths = [['sn']];

	args = Option.Proxy();

	async execute(): Promise<number | void> {
		const configuration = await Configuration.find(
			this.context.cwd,
			this.context.plugins,
		);
		const {project, workspace: activeWorkspace} = await Project.find(
			configuration,
			this.context.cwd,
		);

		await project.restoreInstallState();

		const snuggeryIdentHash = structUtils.makeIdent(
			'snuggery',
			'snuggery',
		).identHash;

		const workspacesToLook = [project.topLevelWorkspace];

		if (activeWorkspace != null) {
			workspacesToLook.unshift(activeWorkspace);
		}

		for (const [i, workspace] of workspacesToLook.entries()) {
			if (!workspace.dependencies.has(snuggeryIdentHash)) {
				continue;
			}

			if (i === 0 && scriptUtils.hasWorkspaceScript(workspace, 'sn')) {
				break;
			}

			return await scriptUtils.executePackageAccessibleBinary(
				workspace.anchoredLocator,
				'sn',
				this.args,
				{
					cwd: this.context.cwd,
					project,
					stdin: this.context.stdin,
					stdout: this.context.stdout,
					stderr: this.context.stderr,
				},
			);
		}

		return this.cli.run(['run', 'sn', ...this.args]);
	}
}
