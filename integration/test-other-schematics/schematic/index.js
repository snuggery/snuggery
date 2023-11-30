const {posix} = require('path');

/**
 *
 * @param {string} name
 * @returns {import('@angular-devkit/schematics').RuleFactory<{path: string}>}
 */
function createRuleFactory(name) {
	return ({path}) =>
		(tree) =>
			tree.create(
				posix.join(path, name),
				`File created by schematic test-other-schematics:${name}`,
			);
}

exports.dolor = createRuleFactory('dolor');
exports.sit = createRuleFactory('sit');
exports.amet = createRuleFactory('amet');
