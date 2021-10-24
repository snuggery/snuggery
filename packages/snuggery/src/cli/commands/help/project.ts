import {isJsonObject} from '@angular-devkit/core';
import {Option} from 'clipanion';
import {createRequire} from 'module';
import {join, posix} from 'path';

import {AbstractCommand} from '../../command/abstract-command';
import {defaultSchematicCollection} from '../../command/schematic';
import {formatMarkdownish} from '../../utils/format';

export class HelpProjectCommand extends AbstractCommand {
	static paths = [['help', 'project']];

	static usage = AbstractCommand.Usage({
		category: 'Workspace information commands',
		description: 'Show information about a project',
	});

	project = Option.String({required: false});

	async execute(): Promise<void> {
		const {workspace, format, report} = this;

		const projectName = this.project ?? this.currentProject;

		if (projectName == null) {
			report.reportInfo(
				'No current project found, try passing in a project name.\n',
			);
			return;
		}

		const project = workspace.getProjectByName(projectName);

		report.reportInfo(`Project \`${format.code(projectName)}\`:\n`);

		report.reportInfo(`Root: \`${format.code(project.root)}\``);
		report.reportInfo(
			`Source root: \`${format.code(
				project.sourceRoot ?? posix.join(project.root, 'src'),
			)}\``,
		);
		report.reportSeparator();

		report.reportInfo(`${format.header('Targets:')}\n`);

		if (project.targets.size === 0) {
			report.reportInfo('No targets are registered in this project.\n');
		} else {
			for (const target of project.targets.keys()) {
				report.reportInfo(`- \`${format.code(target)}\``);
			}

			report.reportSeparator();
			report.reportInfo('For more information about a target, run\n');
			report.reportInfo(
				`  $ ${this.cli.binaryName} help target <target name> ${projectName}\n`,
			);
		}

		report.reportInfo(`${format.header('Schematics:')}\n`);

		let defaultCollection: string;
		if (
			isJsonObject(project.extensions.cli!) &&
			typeof project.extensions.cli.defaultCollection === 'string'
		) {
			({defaultCollection} = project.extensions.cli);
		} else {
			defaultCollection = defaultSchematicCollection;
		}

		if (this.isInstalled(defaultCollection, project.root)) {
			report.reportInfo(
				formatMarkdownish(
					`The default schematic collection is \`${defaultCollection}\`.`,
					{format},
				),
			);
		} else {
			report.reportWarning(
				formatMarkdownish(
					`The default schematic collection is \`${defaultCollection}\`, which is not installed.`,
					{format},
				),
			);
		}

		report.reportSeparator();
	}

	private isInstalled(packageName: string, root: string) {
		for (const path of [
			join(this.workspace.basePath, root),
			this.workspace.basePath,
		]) {
			const require = createRequire(join(path, '<synthetic>'));

			try {
				require.resolve(join(packageName, 'package.json'));

				return true;
			} catch {
				// ignore
			}
		}

		return false;
	}
}
