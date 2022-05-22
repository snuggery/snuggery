/* cspell:ignore bazel */

/**
 * Angular generates imports for components, or whenever functions are used somewhere
 * AOT resolves these statically (e.g. `RouterModule.forRoot()` -> `RouterModule` will
 * be imported)
 *
 * Angular uses a couple of heuristics to generate these imports. It specifically
 * determines whether imported code follows the Angular Package Format (APF) or not.
 *   This is problematic, because we run in a mono-repo where the code used at compile
 * time is not APF but the packages are published as APF. Angular generates the wrong
 * type of imports for us.
 *
 * We have two possible solutions to work around this issue:
 *
 * - Let angular generate these faulty imports and fix them ourselves by manipulating
 *   the results in the program's emitCallback
 * - Use a private API meant for Blaze (Google's internal variant of Bazel) which tells
 *   angular to call a function of ours to generate the paths for these imports.
 *
 * The first approach was used in a different tool and works pretty well, with one
 * downside: angular has a different code path depending on whether rootDir/rootDirs
 * were configured in the typescript configuration, and only one of those code paths
 * works for mono-repos. This means we cannot have a rootDir in the typescript config.
 *
 * The second approach feels less hacky, even if it requires using a private Angular
 * API. It supports rootDir/rootDirs perfectly. This does insert extra imports in some
 * files, though those get stripped away again in the code flattening phase.
 *
 * We'll default to the second approach, but because the first approach is better tested
 * the user can switch to that behavior by setting `SNUGGERY_ANGULAR_FALLBACK=1` in the
 * environment.
 *
 * @see https://github.com/angular/angular/issues/23917
 * @see https://github.com/angular/angular/issues/43271
 * @type {boolean}
 * @default true
 */
export const usePrivateApiAsImportIssueWorkaround = true;

/**
 * Enable API flattening
 *
 * API flattening is prescribed by the Angular Package Format, but executing the
 * `@microsoft/api-extractor` code can double the build time of a package.
 *
 * @type {boolean}
 * @default false
 */
export const enableApiExtractor = false;
