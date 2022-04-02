const {join} = require('path/posix');

/**
 *
 * @param {string} name
 * @returns {import('@angular-devkit/schematics').RuleFactory<{path: string}>}
 */
function createRuleFactory(name) {
	return ({path}) =>
		tree =>
			tree.create(
				join(path, name),
				`File created by schematic test-schematics:${name}`,
			);
}

exports.lorem = createRuleFactory('lorem');
exports.ipsum = createRuleFactory('ipsum');
exports.dolor = createRuleFactory('dolor');
