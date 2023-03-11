import {AbstractCommand} from '../command/abstract-command';

export class HelpCommand extends AbstractCommand {
	static override readonly paths = [
		['help'],
		['--help'],
		['-h'],
		AbstractCommand.Default,
	];

	static override readonly usage = AbstractCommand.Usage({
		category: 'Utility commands',
		description: 'List all available commands',
	});

	async execute(): Promise<number> {
		this.context.report.reportInfo(this.cli.usage(null));

		return 0;
	}
}
