# `@snuggery/yarn`

Builders and schematics to feel right at home in your snuggery yarn mono-repository

## Builders

`@snuggery/yarn:pack` packages a package into a tarball.

Meanwhile, `@snuggery/yarn:deploy` creates versions using `yarn version apply --all`, then creates a version commit and a tag per release package, then builds all packages, if required and finally publishes all packages.

These two builders come in two flavours.

- By default they'll use the regular `yarn pack` and `yarn npm publish` commands, perfect if you want to publish the actual package folder.
- If you install the `@snuggery/yarn-plugin-snuggery-workspace` yarn plugin, the behavior changes. This plugin allows packaging any folder, not just the package folder, which is perfect if you build your package into a dist folder and want to publish that one. These commands do not trigger `prepack`, `postpack` or `prepublish` lifecycle scripts, unlike yarn's builtin counterparts.

You can configure whether you want to use the `@snuggery/yarn-plugin-snuggery-workspace` yarn plugin via the `useWorkspacePlugin` option. If this option is not present, the default behavior is to use the plugin if it's installed.

## License

Licensed under the MIT license.
