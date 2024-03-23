# `@snuggery/journey`

Help developers using your libraries along the journey of (breaking) changes you make.

## Running journeys

There are two ways to travel along a journey:

```bash
journey [options] <package name>
```

Here `package name` is the name of a package that contains journeys.
The command will show a list of journeys you can execute. Select one or more journey and hit enter to start traveling.

```bash
journey [options] --from <version> [--to <version>] <package name>
```

Here `package name` is the name of a package that defines migration journeys.
This command might first ask confirmation whether to include any optional journeys.
Then it travels through all journeys listed between the `--from` version and the `--to` version (or the installed version of the package if no `--to` is passed).

<!-- auto generate: yarn journey --help -->

```
Usage: journey [options] <package>
       journey [options] --from <version> <package>

Options:
	-f, --force   		overwrite files that the journeys try to create if they already exist
	-d, --dry-run 		only show files that would be changed, don't make any actual changes
	-v, --verbose 		include debug logging
	-h, --help    		print this help message

Options when using --from:
	--from        		version to journey from
	--to          		version to journey towards, defaults to the currently installed version
	--partial     		pick and choose which journeys to run
```

## Creating journeys

The `@snuggery/journey` package is built on top of [Angular CLI's Schematics](https://angular.io/guide/schematics) concept. Schematics and this journey package are not linked to the Angular framework itself in any way.

A journey is a schematic `Rule`. This makes journeys available for regular schematics and migration schematics, either on their own or as part of a bigger whole.

The journey itself is a collection of trips. The trips do the heavy lifting, the journey itself is but a container that schedules and manages the trips.
Create a journey by calling the `journey` function with one or more trips.

Journeys are registered in a `journey.json` file. This file contains an object
with a `journey` property which is in itself an object mapping journey names
onto a journey description.

```jsonc
{
	"journey": {
		// A journey without a "version" property is a journey that can be traveled
		// via `journey <package name>`
		"rename-lorem": {
			"factory": "./schematic/journey.js#lorem",
			"description": "Rename export `lorem` from mock package `@integration/test`"
		},
		// A journey with a "version" property is traveled using `journey --from <from> <package name>`
		// if the configured version is higher than the `--from` version and no higher than the
		// `--to` version (or the installed version if `--to` is not passed).
		"rename-ipsum": {
			"version": "2.0.0",
			"factory": "./schematic/journey.js#ipsum",
			"description": "Rename export `ipsum` from mock package `@integration/test`"
		},
		// Optional properties with a version can optionally be traveled along with
		// the required journeys.
		"rename-dolor": {
			"version": "2.0.0",
			"optional": true,
			"factory": "./schematic/journey.js#dolor",
			"description": "Rename export `dolor` from mock package `@integration/test`"
		}
	}
}
```

The `journey` command is backwards compatible with Angular CLI's `ng update` migrations.
You can use `journey` to run migrations, e.g. `journey @angular/core --from 15.0.0`.

## Creating trips

A trip is an object with a `configure` function that registers the actual work that has to be done.

A trip can modify any file via a very low-level API. For javascript and typescript files there's a specific API that use the `typescript` package's API.

## Built-in trips

- `mapImports` (import from `@snuggery/journey/trip/map-imports`) creates a trip to track changed exports, e.g. if an export of your package moved to another module or if an import was renamed
- `updateWorkspace` (import from `@snuggery/journey/trip/update-workspace`) creates a trip to update the workspace configuration, with support for the Angular CLI's `angular.json`, Nx's `workspace.json`, as well as snuggery's own `snuggery.kdl`.
- That's it for now, more to come?

## License

Licensed under the MIT license.
