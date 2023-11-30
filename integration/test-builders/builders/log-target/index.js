const {createBuilder} = require("@angular-devkit/architect");

module.exports = createBuilder(async (opts, ctx) => {
	ctx.logger.info(JSON.stringify(ctx.target));
	return {success: true};
});
