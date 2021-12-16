import type {ChangeLocatorStrategy} from './interface';

/**
 * Strategy that removes the project using `@snuggery/affected`
 * from the list of affected projects.
 *
 * This prevents situations where a `@snuggery/affected` target
 * would execute itself.
 */
export const removeOwnProjectStrategy: ChangeLocatorStrategy = {
	findAffectedProjects({context}, _, affectedProjects) {
		if (context.target?.project) {
			affectedProjects.delete(context.target.project);
		}
	},
};
