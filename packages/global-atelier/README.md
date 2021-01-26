# Atelier - Global

Install Atelier globally via

```bash
# yarn 1
yarn global add @bgotink/global-atelier
# or, npm
npm install -g @bgotink/global-atelier
```

The global `ai` command looks for a local installation and runs the local atelier command when available. This supports local installations via npm, yarn, pnpm, yarn 2 via node_modules as well as pnpm and yarn 2 via Plug'n'Play.
If no local installation is found, the global version is used.

For information on atelier, see [Atelier](https://yarn.pm/@bgotink/atelier).

## License

Licensed under the MIT license.
