# `@snuggery/journey`

Help developers using your libraries along the journey of (breaking) changes you make.

## Creating journeys

The `@snuggery/journey` package is built on top of [Angular CLI's Schematics](https://angular.io/guide/schematics) concept. Schematics and this journey package are not linked to the Angular framework itself in any way.

A journey is a schematic `Rule`. This makes journeys available for regular schematics and migration schematics, either on their own or as part of a bigger whole.

The journey itself is a collection of trips. The trips do the heavy lifting, the journey itself is but a container that schedules and manages the trips.
Create a journey by calling the `journey` function with one or more trips.

## Creating trips

A trip is an object with a `configure` function that registers the actual work that has to be done.

A trip can modify any file via a very low-level API. For javascript and typescript files there's a specific API that use the `typescript` package's API.

## Built-in trips

- `mapImports` (import from `@snuggery/journey/trip/map-imports`) creates a trip to track changed exports, e.g. if an export of your package moved to another module or if an import was renamed
- That's it for now, more to come?

## License

Licensed under the MIT license.
