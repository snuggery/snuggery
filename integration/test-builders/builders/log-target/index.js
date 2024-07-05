const {createBuilder} = require("@angular-devkit/architect");

module.exports = createBuilder(async (opts, ctx) => {
	ctx.logger.info(
		JSON.stringify({
			...ctx.target,
			builderName: ctx.builder.builderName,
		}),
	);

	return {success: true};
});
