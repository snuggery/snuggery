import {Option, UsageError} from 'clipanion';

import {UnknownTargetError} from '../../architect';
import {ArchitectCommand} from '../../command/architect';
import {formatMarkdownish} from '../../utils/format';

export const unsafeTargetNames: ReadonlySet<string> = new Set([
	'generate',
	'help',
	'new',
	'project',
	'run',
]);

export class HelpTargetCommand extends ArchitectCommand {
	static override readonly paths = [['help', 'target']];

	static override readonly usage = ArchitectCommand.Usage({
		category: 'Workspace information commands',
		description: 'Show information about a target',
		examples: [
			[
				'Print information about `build` in the current project',
				'$0 help target build',
			],
			[
				'Print information about `test` in the `app` project',
				'$0 help target test app',
			],
		],
	});

	target = Option.String();

	project = Option.String({required: false});

	async execute(): Promise<number> {
		if (this.project != null) {
			await this.executeWithProject(this.project);
		} else {
			await this.executeWithoutProject();
		}

		return 0;
	}

	private async executeWithProject(projectName: string, projectLabel?: string) {
		const target = this.workspace
			.getProjectByName(projectName)
			.targets.get(this.target);

		if (target == null) {
			throw new UnknownTargetError(
				`Project ${JSON.stringify(
					projectName,
				)} doesn't have a target named ${JSON.stringify(this.target)}`,
			);
		}

		const {report, format} = this;

		report.reportInfo(
			formatMarkdownish(
				`Run target \`${this.format.code(
					this.target,
				)}\` in project \`${this.format.code(projectName)}\`${
					projectLabel ? ` ${projectLabel}` : ''
				} via:`,
				{format},
			),
		);
		report.reportSeparator();

		if (unsafeTargetNames.has(this.target)) {
			const spec =
				this.project != null ? `${this.project}:${this.target}` : this.target;
			report.reportInfo(`  $ ${this.cli.binaryName} run target ${spec}\n`);
		} else if (this.project != null) {
			report.reportInfo(
				`  $ ${this.cli.binaryName} ${this.target} ${this.project}\n`,
			);
		} else {
			report.reportInfo(`  $ ${this.cli.binaryName} ${this.target}\n`);
		}

		report.reportInfo(
			`Add \`${this.format.code(
				'--help',
			)}\` to that command to see the available options.\n`,
		);

		const configurations = Object.keys(target.configurations ?? {});
		if (configurations.length > 0) {
			report.reportInfo(`${this.format.bold('Configurations:')}\n`);

			for (const config of configurations) {
				report.reportInfo(`- ${config}`);
			}

			report.reportSeparator();
		}

		this.printProjectList();
	}

	private async executeWithoutProject() {
		const project = this.tryToFindProject();

		if (project != null) {
			return this.executeWithProject(...project);
		}

		this.printProjectList();
	}

	private tryToFindProject(): [project: string, label: string] | null {
		const {workspace, currentProject, report} = this;

		if (currentProject != null) {
			const project = workspace.getProjectByName(currentProject);
			if (project.targets.has(this.target)) {
				return [currentProject, `(based on current working directory)`];
			}
		}

		const {defaultProject} = this;

		if (typeof defaultProject === 'string') {
			const project = workspace.tryGetProjectByName(defaultProject);

			if (project == null) {
				report.reportWarning(
					`Couldn't find configured default project ${JSON.stringify(
						defaultProject,
					)} in the workspace`,
				);
			} else if (project.targets.has(this.target)) {
				return [defaultProject, `(default project)`];
			}
		}

		const projectsWithTarget = Array.from(workspace.projects)
			.filter(([, {targets}]) => targets.has(this.target))
			.map(([project]) => project);

		if (projectsWithTarget.length === 1) {
			return [projectsWithTarget[0]!, `(only project with this target)`];
		}

		return null;
	}

	private printProjectList() {
		const projects = Array.from(this.workspace.projects)
			.filter(([, {targets}]) => targets.has(this.target))
			.map(([project]) => project);

		if (projects.length === 0) {
			throw new UsageError(
				`Target ${JSON.stringify(
					this.target,
				)} is not configured in any project of this workspace`,
			);
		}

		const {
			currentProject,
			defaultProject,
			project: selectedProject,
			report,
		} = this;

		report.reportInfo(`${this.format.bold('Projects:')}\n`);

		report.reportInfo(
			`Target \`${this.format.code(
				this.target,
			)}\` is available in the following projects:\n`,
		);
		for (const project of projects) {
			let label = '';
			switch (project) {
				case currentProject:
					label = ' (project in current working directory)';
					break;
				case defaultProject:
					label = ' (default project)';
					break;
				case selectedProject:
					label = ' (selected project)';
					break;
			}

			report.reportInfo(`- \`${this.format.code(project)}\`${label}`);
		}
	}
}
