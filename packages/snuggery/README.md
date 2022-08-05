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

## License

Licensed under the MIT license.
