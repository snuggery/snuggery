try {
  module.exports = require('../../../packages/yarn-plugin-snuggery-workspace/bundles/@yarnpkg/plugin-snuggery-workspace');
} catch {
  module.exports = require('../../../packages/yarn-plugin-snuggery-workspace/bin/@yarnpkg/plugin-snuggery-workspace');
}
