# `@snuggery/angular`

This package supports building angular packages in a monorepository. The core idea behind this package is that you want to focus on writing code, not lose time in running builds.

- Using [yarn workspaces](https://yarnpkg.com/features/workspaces) (or whatever alternative your package manager supports) all dependencies are truly installed, even the local packages.
- Boilerplate is limited to the absolute minimum: you need at least one `tsconfig.json` file

  - This package provides the basic configuration for a strict angular project, so your tsconfig could be as small as

    ```json
    {"extends": "@snuggery/angular"}
    ```

- The `main` property of the `package.json` points towards the source code of your package.
  - This allows typescript to use your package without requiring any `paths` mapping.
  - This also allows the `@snuggery/angular:build` to build an angular package without first having to build its dependencies.
- There is extensive caching within a single process when building packages. This makes building all angular packages in your workspace using a single process, e.g. using `@snuggery/snuggery:glob` to run the `build` target on all packages, a lot faster than running every package's build in a separate process.

## Builder

`@snuggery/angular:build` builds an angular library into a package that can be published to an npm registry.

<!-- auto generate: yarn ./integration/__fixtures__/angular sn help builder @snuggery/angular:build -->

```
Builder `build` of package `@snuggery/angular`

Build an angular package

Properties:

- `primaryEntryPoint`
  Primary entry point to build, defaults to the package in the project root
  Type: one of
  - `string`
  - or an object:

    Properties:

    - `manifest` (required)
      Path to the `package.json` of this entry point
      Type: `string`

    - `main`
      The main file of this entry point, defaults to the `main` property of this
      entry point's manifest
      Type: `string`

    - `tsconfig`
      TypeScript configuration to use for this entry point instead of the
      `tsconfig` in the options
      Type: `string`


- `secondaryEntryPoints`
  Secondary entry points to build, defaults to not building any secondary entry
  points
  Default value is `[]`
  Type: an array with items of type
  - `string`
  - or an object:

    Properties:

    - `manifest` (required)
      Path to the `package.json` of this entry point
      Type: `string`

    - `main`
      The main file of this entry point, defaults to the `main` property of this
      entry point's manifest
      Type: `string`

    - `tsconfig`
      TypeScript configuration to use for this entry point instead of the
      `tsconfig` in the options
      Type: `string`


- `tsconfig`
  Path to the tsconfig.json file, defaults to `<projectFolder>/tsconfig.json`
  Type: `string`

- `keepScripts`
  Whether to keep the scripts in package.json, defaults to false
  Type: `boolean`

- `keepDevDependencies`
  Whether to keep the devDependencies in package.json, defaults to false
  Type: `boolean`

- `inlineStyleLanguage`
  Language for inline styles in components, defaults to `css`
  Type: `string`

- `assets`
  Assets to copy
  Type: an array containing objects:

  Properties:

  - `include` (required)
    Globs to include in the asset, relative to `from`
    Types:
    - `string`
    - `string[]`

  - `exclude`
    Globs to exclude, relative to `from`
    Types:
    - `string`
    - `string[]`

  - `from`
    The path to include the assets from, defaults to the root of the active
    project
    Type: `string`

  - `to`
    The path to write the assets to, defaults to the folder the package is being
    built into
    Type: `string`


- `packager`
  Packager to run after building, e.g. `@snuggery/yarn:pack`. If the builder
  name is `pack` it can be left, out, e.g. `@snuggery/yarn` will run the same
  builder as `@snuggery/yarn:pack`.
  Type: `string`

- `outputFolder`
  The folder to build the package to, defaults to `<projectFolder>/dist`
  Type: `string`

- `plugins`
  List of plugins to use while building
  Default value is `[]`
  Type: `(string | [string, object])[]`

- `flags`
  Flags that change how the angular packages are built by this builder
  Type: an object:

  Properties:

  - `usePrivateApiAsImportIssueWorkaround`
    Choose which workaround to use to prevent angular from mistakenly outputting
    deep imports: a private API or a very specific find-and-replace. Defaults to
    `true`
    Type: `boolean`

  - `enableApiExtractor`
    Enable API flattening, as prescribed by the Angular Package Format. Enabling
    this flag can double the time it takes to build a package. Defaults to
    `false`
    Type: `boolean`

  - `useCentralOutputFolder`
    Whether the `outputFolder` defaults to a centralized folder or a folder per
    package, defaults to true unless Yarn PnP is detected
    Type: `boolean`
```

None of the inputs are required, and some can be configured globally in your workspace configuration (`angular.json` or `workspace.json`):

- `plugins`
- `flags`
- `packager`
- `tsconfig`
- `keepScripts`
- `keepDevDependencies`
- `inlineStyleLanguage`

These can be configured for the entire workspace by placing them inside a `@snuggery/angular` section in the configuration.

```jsonc
{
	"version": 1, // or 2 if you're using nx
	"projects": {
		/* ... */
	},
	"@snuggery/angular": {
		"tsconfig": "./tsconfig.json",
		"inlineStyleLanguage": "scss"
	}
}
```

## Plugins

Plugins allows for extension of the `@snuggery/angular` compiler. These are the current extension points:

- `styleProcessor`, which allows it to e.g. provide support for Stylus or to override the built-in SASS loader.
- `typescriptTransformers`, which are passed as `customTransformers` to typescript. This allows you to hook into the compilation itself, e.g. to modify generated javascript or generated types.
- `processManifest`, a function that is called with the `package.json` before it is written in the output folder.
- `finalize` is called after the package build is complete, before the build function returns

The plugin API is considered experimental.

This package itself defines a few plugins:

### Plugin `@snuggery/angular/plugins#tslib`

This plugin ensures that `tslib` is a dependency of the package if and only if it is necessary. It has one optional parameter, the version of tslib to write to the `package.json`.

```jsonc
{
	/* ... */
	"plugins": [
		// Use the default version of tslib provided in the plugin
		"@snuggery/angular/plugins#tslib",
		// Or define the version to use:
		["@snuggery/angular/plugins#tslib", {"version": "^2.3.1"}]
	]
	/* ... */
}
```

### Plugin `@snuggery/angular/plugins#validateDependencies`

This plugin validates that the package declares all necessary dependencies, and that the package doesn't contain superfluous dependencies. It accepts two optional parameters:

- `allowedUnusedDependencies` is a list of dependencies that can be declared without being used, defaults to an empty list.
  This option can be used, for example, when your package also exports SASS/LESS/CSS files that reference a CSS library like bootstrap or normalize.css. The validation step would complain that bootstrap and normalize.css aren't used, so you can add them to this list.
- `warnOnly` treats unused or undeclared dependencies as warnings instead of errors, defaults to `false`

## API

The easiest way to get up and running using this package is by using the `@snuggery/angular:build` in a CLI compatible with Angular builders (Angular's own CLI `ng`, Nrwl's `nx` or `@snuggery/snuggery`'s own `sn`).
The main functionality of this builder is also exposed as an API. This includes the building of the angular library to the APF requirements, but does not include extras such as copying over assets or packaging the library into a tarball that can be uploaded to an npm package registry.

The `@snuggery/angular` package exposes:

- `build`  
  The function that does all of the heavy lifting. Only one input is required: the primary entry point, all other inputs have sane defaults
- `createCompileCache`  
  A function that returns an (empty) cache that can be passed into the `cache` option of the `build` function.
- `BuildFailureError`  
  The error type that is thrown by the `build` function and by plugins if the build failed due to something that isn't a bug in this package, e.g. user error.
  For example, this error is thrown in the `validateDependencies` plugin if the declared dependencies don't match the used dependencies.

## License

Licensed under the MIT license.