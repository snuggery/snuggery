'use strict';
// @ts-check

const {createBuilder} = require('@angular-devkit/architect');
const {npath, ppath} = require('@yarnpkg/fslib');

const {exec} = require('./util');

module.exports = createBuilder(async function ({tag}, ctx) {
  ctx.logger.info(`Publishing project ${ctx.target.project}`);

  const root = ppath.join(
    npath.toPortablePath(ctx.workspaceRoot),
    (await ctx.getProjectMetadata(ctx.target.project)).root,
  );

  try {
    await exec(
      'yarn',
      [
        'snuggery-workspace',
        'publish',
        ...(typeof tag === 'string' ? ['--tag', tag] : []),
      ],
      root,
    );
  } catch (e) {
    return {
      success: false,
      error: e?.message ?? e,
    };
  }

  return {success: true};
});
