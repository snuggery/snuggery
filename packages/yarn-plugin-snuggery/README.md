# `@snuggery/yarnpkg-plugin-snuggery`

A small yarn plugin that makes the `sn` command available throughout your entire yarn project.

> Nota bene: yarn and angular/nx/snuggery have slightly different terminology. In yarn there's one project that contains one or more workspaces, and in angular/nx/snuggery it's the other way around.
> In this document the yarn terminology is used.

Install this plugin and install `@snuggery/snuggery` in the `package.json` at the root of your project. You can now run `yarn sn` anywhere in the project, regardless of whether the workspace you're in right now has it installed.

## Installation

Install this yarn plugin via

```bash
yarn plugin import https://github.com/snuggery/snuggery/raw/main/packages/yarn-plugin-snuggery/bin/%40yarnpkg/plugin-snuggery.js
```
