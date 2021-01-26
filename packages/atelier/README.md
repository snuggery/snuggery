# Atelier

An `ng`-like Angular CLI alternative

```
Atelier - 0.2.1

  $ ai <command>

Architect commands:

  ai [--configuration,-c #0] <target> ...
    Run a target in the current project

  ai [--configuration,-c #0] <target> <project> ...
    Run a target in a project

  ai run builder <builder> ...
    Run a builder by name

  ai run target <specifier> ...
    Run a target by specifier

Schematic commands:

  ai generate ...
    Alias for `ai run schematic`

  ai new [--dry-run] [--force] [--show-file-changes] <collection> ...
    Create a new workspace

  ai run migration [--dry-run] [--force] [--show-file-changes] [--ignore-missing-migrations] [--name #0] [--from #0] [--to #0] <package>
    Run migration(s) of a package

  ai run schematic [--dry-run] [--force] [--show-file-changes] <schematic> ...
    Run a schematic to generate and/or modify files

Utility commands:

  ai help
    List all available commands

  ai project <projectName> <command> ...
    Run a command within a project

Workspace information commands:

  ai --version
    Print version information

  ai help builder <builder>
    Show information about a builder

  ai help builders <packageName>
    Show information about the builders of a package

  ai help migrations <package>
    Show information about migrations for a package

  ai help project [project]
    Show information about a project

  ai help projects
    Show information about all projects

  ai help schematic <schematic>
    Show information about a schematic

  ai help schematics [collectionName]
    Show information about schematic collection

  ai help target <target> [project]
    Show information about a target

  ai help targets
    Show information about all available targets

You can also print more details about any of these commands by calling them
after adding the `-h,--help` flag right after the command name.
```

## Built-in builders

Atelier provides a couple of builders that are useful to manage workspaces:

- `@bgotink/atelier:combine`: Combine multiple targets into one
- `@bgotink/atelier:glob`: Run a target in multiple projects
- `@bgotink/atelier:execute`: Run any program as a builder

These builders work regardless of whether you're using Angular's `ng`, Narwhal's
`nx` or atelier's `ai` as CLI.

Use atelier to print information on these builders:

```bash
ai help builder @bgotink/atelier:glob
```

## Global installation

If you want to install Atelier globally, see [`@bgotink/global-atelier`](https://yarn.pm/@bgotink/global-atelier).

## License

Licensed under the MIT license.
