import type {Target} from '@angular-devkit/architect';
import {Option} from 'clipanion';

import {ArchitectCommand} from '../../command/architect';

export class RunTargetCommand extends ArchitectCommand {
	static override readonly paths = [['run', 'target'], ['run']];

	static override readonly usage = ArchitectCommand.Usage({
		category: 'Architect commands',
		description: 'Run a target by specifier',
		examples: [
			[
				'Run the `build` target in the `application` project',
				'$0 run target application:build',
			],
			[
				'Run the `build` target with the `production` configuration in the `application` project',
				'$0 run target application:build:production',
			],
			['Run the `test` target in the current project', '$0 run target test'],
		],
	});

	specifier = Option.String();

	args = Option.Proxy();

	async execute(): Promise<number> {
		let target: Target;
		if (this.specifier.includes(':')) {
			const {targetFromTargetString} = await import('@snuggery/architect');
			target = targetFromTargetString(this.specifier);
		} else {
			target = await this.resolveTarget(this.specifier, null);
		}

		return this.withOptionValues(
			{
				...(await this.getOptionsForTarget(target)),
				description: `Run the \`${this.specifier}\` target`,
				pathSuffix: [this.specifier],
				values: this.args,
			},
			(options) => this.runTarget({target, options}),
		);
	}
}
