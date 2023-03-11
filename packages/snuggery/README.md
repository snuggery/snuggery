# Snuggery

An `ng`-like CLI to manage your workspace

<!-- auto generate: yarn sn help -->

```
Snuggery

  $ sn <command>

Architect commands

  sn [--configuration,-c #0] <target> ...
    Run a target in the current project

  sn [--configuration,-c #0] <target> <project> ...
    Run a target in a project

  sn run builder <builder> ...
    Run a builder by name

  sn run target <specifier> ...
    Run a target by specifier

Schematic commands

  sn generate ...
    Alias for `sn run schematic`

  sn new [--dry-run] [--force] [--show-file-changes] <collection> ...
    Create a new workspace

  sn run schematic [--dry-run] [--force] [--show-file-changes] <schematic> ...
    Run a schematic to generate and/or modify files

Update commands

  sn help update
    Print extensive information on the update process and all steps to take

  sn run migration [--dry-run] [--force] [--show-file-changes] [--ignore-missing-migrations] [--name #0] [--from #0] [--to #0] <package>
    Run migration(s) of a package

  sn run migrations [--prepare] [--dry-run] [--force] [--show-file-changes] [--ignore-missing-migrations] [file]
    Run registered migrations

  sn run update ...
    Update packages and prepare migrations

Utility commands

  sn --sync-config [--validate] [--merge] [--from #0] <--to #0>
    Sync config from one format to another

  sn help
    List all available commands

  sn project <projectName> <command> ...
    Run a command within a project

Workspace information commands

  sn --doctor
    Diagnose configuration mistakes

  sn --version
    Print version information

  sn help builder <builder>
    Show information about a builder

  sn help builders <packageName>
    Show information about the builders of a package

  sn help migrations [--from #0] [--to #0] <package>
    Show information about migrations for a package

  sn help project [project]
    Show information about a project

  sn help projects
    Show information about all projects

  sn help schematic <schematic>
    Show information about a schematic

  sn help schematics [collectionName]
    Show information about schematic collection

  sn help target <target> [project]
    Show information about a target

  sn help targets
    Show information about all available targets

You can also print more details about any of these commands by calling them with
the `-h,--help` flag right after the command name.
```

## Built-in builders

Snuggery provides a couple of builders that are useful to manage workspaces:

- `@snuggery/snuggery:combine`: Combine multiple targets into one
- `@snuggery/snuggery:glob`: Run a target in multiple projects
- `@snuggery/snuggery:execute`: Run any program as a builder

These builders work regardless of whether you're using Angular's `ng`, Narwhal's `nx` or snuggery's `sn` as CLI.

Use snuggery to print information on these builders:

```bash
sn help builder @snuggery/snuggery:glob
```

## Global installation

If you want to install Snuggery globally, see [`@snuggery/global`](https://yarn.pm/@snuggery/global).

## Create your own CLI

You can create your own CLI using the `run` function exported by `@snuggery/snuggery/mini`. Pass it information about your CLI, as well as a mapping of command names onto builders.

```js
#!/usr/bin/env node
import {run} from '@snuggery/snuggery/mini';
import {createRequire} from 'node:module';

await run({
	// Label used in errors and help messages
	binaryLabel: 'build-lit',
	// The name of the binary as it's executed, e.g.
	//   $ build-lit --help
	//   $ build-lit test
	binaryName: 'build-lit',
	// The version of your binary
	binaryVersion: createRequire(import.meta.url)('./package.json').version,
	// Basename(s) of configuration files that can be used by your users
	// The following extensions are supported: .json, .yaml, and .kdl
	basename: [
		// Allow configuration via
		// build-lit.config.json, build-lit.config.yaml, or build-lit.config.kdl
		'build-lit.config',
	],
	// Map subcommand names onto builders
	targets: new Map([
		// make `build-lit build` execute builder '@ngx-lit/build-lit:browser'
		// This builder can be one of
		// - A builder created using `@angular-devkit/architect`
		// - An executor created using nx
		// - A builder created using `@snuggery/architect`
		['build', '@ngx-lit/build-lit:browser'],
		['extract-i18n', '@ngx-lit/build-lit:extract-i18n'],
		['serve', '@ngx-lit/build-lit:dev-server'],
		['test', '@ngx-lit/build-lit:karma'],
	]),
});
```

Options can be passed into the commands via CLI arguments, or via the configuration files. These files can contain pre-configured configurations which can be toggled on or off via the `--configuration` argument. Options passed via CLI arguments overrule any configured value for that option.

```
$ build-lit build --configuration production
```

## License

Licensed under the MIT license.
