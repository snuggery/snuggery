# Atelier

An `ng`-like Angular CLI alternative

```
Atelier - 0.1.1

  $ ai <command>

Where <command> is one of:

  ai --version
    Print version information

  ai help
    Show this usage statement

  ai help target <target> [project]
    Show information about a target

  ai help targets [--all,-a #0]
    Show information about all available targets

  ai project <projectName> <command> ...
    Run a command within a project

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

  ai generate [--dry-run] [--force] [--show-file-changes] <schematic> ...
    Generate and/or modify files based on a schematic

You can also print more details about any of these commands by calling them
after adding the `-h,--help` flag right after the command name.
```

## Built-in builders

Atelier provides a couple of builders that are useful to manage workspaces:

- `@bgotink/atelier:combine`: Combine multiple targets into one
- `@bgotink/atelier:glob`: Run a target in multiple projects
- `@bgotink/atelier:execute`: Run any program as a builder

These builders work regardless of whether you're using the Angular's `ng`,
Narwhal's `nx` or atelier's `ai` as CLI.

Use atelier to print information on these builders:

```bash
ai help builder @bgotink/atelier:glob
```

## License

Licensed under the MIT license, see LICENSE.md
