# Snuggery - Global

Install Snuggery globally via

```bash
# yarn 1
yarn global add @snuggery/global
# or, npm
npm install -g @snuggery/global
```

The global `sn` command looks for a local installation and runs the local Snuggery command when available. This supports local installations via npm, yarn, pnpm, yarn 2 via node_modules as well as pnpm and yarn 2 via Plug'n'Play.
If no local installation is found, the global version is used.

For information on Snuggery, see [`@snuggery/snuggery`](https://yarn.pm/@snuggery/snuggery).

## License

Licensed under the MIT license.
