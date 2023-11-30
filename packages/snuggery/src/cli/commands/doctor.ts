import {AbstractCommand} from "../command/abstract-command";
import type {Report} from "../utils/report";

export class DoctorCommand extends AbstractCommand {
	static override readonly paths = [["--doctor"]];

	static override readonly usage = AbstractCommand.Usage({
		category: "Workspace information commands",
		description: "Diagnose configuration mistakes",
	});

	async execute(): Promise<number> {
		const {report, workspace} = this;
		const subReport = report.createSubReport();

		const [architect, schematics] = await Promise.all([
			this.#setupArchitect(subReport),
			this.#setupSchematics(subReport),
		]);

		await (
			await import("./doctor/index.js")
		).doctor({
			report: subReport,
			workspace,

			architect,
			schematics,
		});

		if (subReport.numberOfErrors > 0) {
			report.reportSeparator();
			report.reportError("Failed with errors");
			return 1;
		}

		if (subReport.numberOfWarnings) {
			report.reportSeparator();
			report.reportWarning("Succeeded with warnings");
		} else {
			report.reportInfo("Everything is A-OK!");
		}

		return 0;
	}

	async #setupArchitect(report: Report) {
		const [registry, host] = await Promise.all([
			this.architectSchemaRegistry,
			this.architectHost,
		]);

		// Override X-Deprecated warning provide to end up in the doctor sub report so it counts as warning
		registry.useXDeprecatedProvider((msg) => report.reportWarning(msg));

		return {host, registry};
	}

	async #setupSchematics(report: Report) {
		const registry = await this.schematicsSchemaRegistry;

		// Override X-Deprecated warning provide to end up in the doctor sub report so it counts as warning
		registry.useXDeprecatedProvider((msg) => report.reportWarning(msg));

		const engineHost = await this.createEngineHost(
			this.workspace.workspaceFolder,
			false,
		);
		const workflow = await this.createWorkflow(
			engineHost,
			this.workspace.workspaceFolder,
			false,
			false,
		);

		return {workflow, engineHost, registry};
	}
}
