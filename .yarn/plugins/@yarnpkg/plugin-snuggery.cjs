try {
  module.exports = require('../../../packages/yarn-plugin-snuggery/bundles/@yarnpkg/plugin-snuggery');
} catch {
  module.exports = require('../../../packages/yarn-plugin-snuggery/bin/@yarnpkg/plugin-snuggery');
}
