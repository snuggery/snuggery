export interface AbstractSchema {
  /**
   * Arguments to pass in
   */
  arguments?: string[];

  /**
   * The working directory for running the command in, defaults to the project's root
   */
  cwd?: string;

  /**
   * Extra environment variables to pass into the child process
   */
  env?: {[name: string]: string};

  /**
   * Configuration for standard input and output
   */
  stdio?:
    | 'inherit'
    | 'ignore'
    | ['inherit' | 'ignore', 'inherit' | 'ignore', 'inherit' | 'ignore'];
}

export interface PathBinarySchema extends AbstractSchema {
  /**
   * The name of the binary to run
   */
  binary: string;
}

export interface PackageBinarySchema extends AbstractSchema {
  /**
   * The package to load the executable from
   */
  package: string;

  /**
   * Path(s) to resolve the package from, defaults to the project the target is in and the workspace root
   */
  resolveFrom?: string | string[];

  /**
   * The binary to run
   *
   * If the `binary` is a relative path, e.g. `./foo.js`, it is resolved relative to the package.
   * If the `binary` is any other non-empty value, it is assumed to be the name of a binary exposed
   * by the package.
   *
   * If the `binary` is empty, it is set to the unscoped name of the package (e.g. `pkg` for `@scope/pkg`)
   */
  binary?: string;
}

export type Schema = PackageBinarySchema | PathBinarySchema;
