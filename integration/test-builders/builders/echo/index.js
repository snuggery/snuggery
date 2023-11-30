const {createBuilder} = require("@angular-devkit/architect");

module.exports = createBuilder(async (opts, ctx) => {
	ctx.logger.info(JSON.stringify(opts));
	return {success: true};
});
