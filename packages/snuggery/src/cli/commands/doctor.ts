import {AbstractCommand} from '../command/abstract-command';
import type {Report} from '../utils/report';

export class DoctorCommand extends AbstractCommand {
	static override readonly paths = [['--doctor']];

	static override readonly usage = AbstractCommand.Usage({
		category: 'Workspace information commands',
		description: `Diagnose configuration mistakes`,
	});

	async execute(): Promise<number> {
		const {report, workspace} = this;
		const subReport = report.createSubReport();

		const [architect, schematics] = await Promise.all([
			this.#setupArchitect(subReport),
			this.#setupSchematics(subReport),
		]);

		await (
			await import('./doctor/index.js')
		).doctor({
			report: subReport,
			workspace,

			architect,
			schematics,
		});

		if (subReport.numberOfErrors > 0) {
			report.reportSeparator();
			report.reportError('Failed with errors');
			return 1;
		}

		if (subReport.numberOfWarnings) {
			report.reportSeparator();
			report.reportWarning('Succeeded with warnings');
		} else {
			report.reportInfo('Everything is A-OK!');
		}

		return 0;
	}

	async #setupArchitect(report: Report) {
		const [{schema}, {createArchitectHost}] = await Promise.all([
			import('@angular-devkit/core'),
			import('../architect/index.js'),
		]);

		const registry = new schema.CoreSchemaRegistry();
		registry.addPostTransform(schema.transforms.addUndefinedDefaults);
		registry.useXDeprecatedProvider(msg => report.reportWarning(msg));

		const host = createArchitectHost(this.context, this.workspace);

		return {host, registry};
	}

	async #setupSchematics(report: Report) {
		const [{schema}, {formats}, {SnuggeryEngineHost}, {SnuggeryWorkflow}] =
			await Promise.all([
				import('@angular-devkit/core'),
				import('@angular-devkit/schematics'),
				import('../schematic/engine-host.js'),
				import('../schematic/workflow.js'),
			]);

		const registry = new schema.CoreSchemaRegistry(formats.standardFormats);
		registry.addPostTransform(schema.transforms.addUndefinedDefaults);
		registry.useXDeprecatedProvider(msg => report.reportWarning(msg));
		registry.addSmartDefaultProvider('projectName', () => 'test-project');

		const engineHost = new SnuggeryEngineHost(this.workspace.basePath, {
			context: this.context,
			registry,
			resolvePaths: [this.workspace.basePath],
			schemaValidation: true,
		});

		return new SnuggeryWorkflow(this.workspace.basePath, {
			engineHost,
			force: false,
			dryRun: true,
			registry,
		});
	}
}
