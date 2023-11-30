const {createBuilder} = require("@angular-devkit/architect");

module.exports = createBuilder(async (input, context) => {
	context.logger.info(JSON.stringify(input));
	return {success: true};
});
