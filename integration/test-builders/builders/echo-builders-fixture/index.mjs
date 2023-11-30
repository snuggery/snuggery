import {createBuilder} from "@angular-devkit/architect";

export default createBuilder(async (opts, ctx) => {
	ctx.logger.info(JSON.stringify(opts));
	return {success: true};
});
