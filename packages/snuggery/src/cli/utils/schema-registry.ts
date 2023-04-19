/**
 * @license
 * This file started as a copy of code by the Angular team.
 * https://github.com/angular/angular-cli/blob/9fafb2e1251f6790392a1f9c84854086c85d2191/packages/angular_devkit/core/src/json/schema/registry.ts#L92
 *
 * Copyright (c) 2017 Google, Inc.
 * Licensed under the MIT License, https://github.com/angular/angular-cli/blob/9fafb2e1251f6790392a1f9c84854086c85d2191/LICENSE
 */

import {PartiallyOrderedSet, schema} from '@angular-devkit/core';
import type {JsonObject, JsonValue} from '@snuggery/core';
import Ajv, {SchemaObjCxt, ValidateFunction} from 'ajv';
import ajvAddFormats from 'ajv-formats';
import http from 'node:http';
import https from 'node:https';
import {resolve as resolveUrl} from 'node:url';
import {Observable, from, isObservable, throwError, firstValueFrom} from 'rxjs';

export type UriHandler = (
	uri: string,
) => Observable<JsonObject> | Promise<JsonObject> | null | undefined;

interface SchemaInfo {
	smartDefaultRecord: Map<string, JsonObject>;
	promptDefinitions: Array<schema.PromptDefinition>;
}

const {visitJson, getTypesOfSchema} = schema;

export interface CompiledSchema extends schema.SchemaValidator {
	applyPreTransforms(data: JsonValue): Promise<JsonValue>;
}

/**
 * A modified copy of angular's CoreSchemaRegistry that supports running only the pre-transforms
 */
export class SchemaRegistry implements schema.SchemaRegistry {
	readonly #ajv: Ajv;
	readonly #uriCache = new Map<string, Promise<JsonObject>>();
	readonly #uriHandlers = new Set<UriHandler>();
	readonly #pre = new PartiallyOrderedSet<schema.JsonVisitor>();
	readonly #post = new PartiallyOrderedSet<schema.JsonVisitor>();

	#awaitCompilation?: Promise<unknown>;

	#currentCompilationSchemaInfo?: SchemaInfo;

	#promptProvider?: schema.PromptProvider;
	#deprecationLogger?: (message: string) => void;
	#sourceMap = new Map<string, schema.SmartDefaultProvider<JsonValue>>();

	constructor(formats: schema.SchemaFormat[] = []) {
		this.#ajv = new Ajv({
			strict: false,
			loadSchema: uri => this.#fetch(uri),
			passContext: true,
			addUsedSchema: false,
		});

		ajvAddFormats(this.#ajv);

		for (const format of formats) {
			this.addFormat(format);
		}
	}

	// cspell:ignore ɵflatten
	ɵflatten(): Promise<JsonObject> {
		throw new Error('Method not implemented.');
	}

	async #fetch(uri: string): Promise<JsonObject> {
		const maybeSchema = this.#uriCache.get(uri);

		if (maybeSchema) {
			return await maybeSchema;
		}

		// Try all handlers, one after the other.
		for (const handler of this.#uriHandlers) {
			let handlerResult = handler(uri);
			if (handlerResult === null || handlerResult === undefined) {
				continue;
			}

			if (isObservable(handlerResult)) {
				handlerResult = firstValueFrom(handlerResult);
			}

			this.#uriCache.set(uri, handlerResult);

			return await handlerResult;
		}

		// If none are found, handle using http client.
		const result = new Promise<JsonObject>((resolve, reject) => {
			const url = new URL(uri);
			const client = url.protocol === 'https:' ? https : http;
			client.get(url, res => {
				if (!res.statusCode || res.statusCode >= 300) {
					// Consume the rest of the data to free memory.
					res.resume();
					reject(
						new Error(
							`Requesting ${url} failed. Status Code: ${res.statusCode}`,
						),
					);
				} else {
					res.setEncoding('utf8');
					let data = '';
					res.on('data', chunk => {
						data += chunk;
					});
					res.on('end', () => {
						try {
							resolve(JSON.parse(data));
						} catch (err) {
							reject(err);
						}
					});
				}
			});
		});
		this.#uriCache.set(uri, result);
		return await result;
	}

	/**
	 * Add a transformation step before the validation of any Json.
	 * @param {JsonVisitor} visitor The visitor to transform every value.
	 * @param {JsonVisitor[]} deps A list of other visitors to run before.
	 */
	addPreTransform(visitor: schema.JsonVisitor, deps?: schema.JsonVisitor[]) {
		this.#pre.add(visitor, deps);
	}

	/**
	 * Add a transformation step after the validation of any Json. The JSON will not be validated
	 * after the POST, so if transformations are not compatible with the Schema it will not result
	 * in an error.
	 * @param {JsonVisitor} visitor The visitor to transform every value.
	 * @param {JsonVisitor[]} deps A list of other visitors to run before.
	 */
	addPostTransform(visitor: schema.JsonVisitor, deps?: schema.JsonVisitor[]) {
		this.#post.add(visitor, deps);
	}

	protected _resolver(
		ref: string,
		validate?: ValidateFunction,
	): {context?: ValidateFunction; schema?: JsonObject} {
		if (!validate || !ref) {
			return {};
		}

		const schema = validate.schemaEnv.root.schema;
		const id = typeof schema === 'object' ? schema.$id : null;

		let fullReference = ref;
		if (typeof id === 'string') {
			fullReference = resolveUrl(id, ref);

			if (ref.startsWith('#')) {
				fullReference = id + fullReference;
			}
		}

		const resolvedSchema = this.#ajv.getSchema(fullReference);

		return {
			context: resolvedSchema?.schemaEnv.validate,
			schema: resolvedSchema?.schema as JsonObject,
		};
	}

	/**
	 * Flatten the Schema, resolving and replacing all the refs. Makes it into a synchronous schema
	 * that is also easier to traverse. Does not cache the result.
	 *
	 * @param schema The schema or URI to flatten.
	 * @returns An Observable of the flattened schema object.
	 * @deprecated since 11.2 without replacement.
	 * Producing a flatten schema document does not in all cases produce a schema with identical behavior to the original.
	 * See: https://json-schema.org/draft/2019-09/json-schema-core.html#rfc.appendix.B.2
	 */
	flatten(): Observable<JsonObject> {
		return throwError(new Error('SchemaRegistry#flatten is not supported'));
	}

	/**
	 * Compile and return a validation function for the Schema.
	 *
	 * @param schema The schema to validate. If a string, will fetch the schema before compiling it
	 * (using schema as a URI).
	 * @returns An Observable of the Validation function.
	 */
	async compile(schema: schema.JsonSchema): Promise<CompiledSchema> {
		if (typeof schema === 'boolean') {
			return Object.assign(
				async (data: JsonValue) => ({success: schema, data}),
				{
					applyPreTransforms: async (data: JsonValue) => data,
				},
			);
		}

		while (this.#awaitCompilation != null) {
			await this.#awaitCompilation;
		}

		const schemaInfo: SchemaInfo = {
			smartDefaultRecord: new Map<string, JsonObject>(),
			promptDefinitions: [],
		};

		let validator: ValidateFunction;

		try {
			this.#currentCompilationSchemaInfo = schemaInfo;
			validator = this.#ajv.compile(schema);
		} catch (e) {
			// This should eventually be refactored so that we we handle race condition where the same schema is validated at the same time.
			if (!(e instanceof Ajv.MissingRefError)) {
				throw e;
			}

			validator = await (this.#awaitCompilation =
				this.#ajv.compileAsync(schema));
		} finally {
			this.#currentCompilationSchemaInfo = undefined;
		}

		const validate = async (
			data: JsonValue,
			options?: schema.SchemaValidatorOptions,
		) => {
			const validationOptions: schema.SchemaValidatorOptions = {
				withPrompts: true,
				applyPostTransforms: true,
				applyPreTransforms: true,
				...options,
			};
			const validationContext = {
				promptFieldsWithValue: new Set<string>(),
			};

			// Apply pre-validation transforms
			if (validationOptions.applyPreTransforms) {
				for (const visitor of this.#pre.values()) {
					data = await firstValueFrom(
						visitJson(
							data,
							visitor,
							schema,
							this._resolver.bind(this),
							validator,
						),
					);
				}
			}

			// Apply smart defaults
			await this.#applySmartDefaults(data, schemaInfo.smartDefaultRecord);

			// Apply prompts
			if (validationOptions.withPrompts) {
				const visitor: schema.JsonVisitor = (value, pointer) => {
					if (value !== undefined) {
						validationContext.promptFieldsWithValue.add(pointer);
					}

					return value;
				};
				if (typeof schema === 'object') {
					await visitJson(
						data,
						visitor,
						schema,
						this._resolver.bind(this),
						validator,
					).toPromise();
				}

				const definitions = schemaInfo.promptDefinitions.filter(
					def => !validationContext.promptFieldsWithValue.has(def.id),
				);

				if (definitions.length > 0) {
					await this.#applyPrompts(data, definitions);
				}
			}

			// Validate using ajv
			try {
				const success = validator.call(validationContext, data);

				if (!success) {
					return {data, success, errors: validator.errors ?? []};
				}
			} catch (error) {
				if (error instanceof Ajv.ValidationError) {
					return {data, success: false, errors: error.errors};
				}

				throw error;
			}

			// Apply post-validation transforms
			if (validationOptions.applyPostTransforms) {
				for (const visitor of this.#post.values()) {
					data = await firstValueFrom(
						visitJson(
							data,
							visitor,
							schema,
							this._resolver.bind(this),
							validator,
						),
					);
				}
			}

			return {data, success: true};
		};

		return Object.assign(validate, {
			applyPreTransforms: async (data: JsonValue) => {
				for (const visitor of this.#pre.values()) {
					data = await firstValueFrom(
						visitJson(
							data,
							visitor,
							schema,
							this._resolver.bind(this),
							validator,
						),
					);
				}
				return data;
			},
		});
	}

	addFormat({name, formatter}: schema.SchemaFormat): void {
		this.#ajv.addFormat(name, formatter);
	}

	addSmartDefaultProvider(
		source: string,
		provider: schema.SmartDefaultProvider<JsonValue>,
	): void;
	addSmartDefaultProvider<T>(
		source: string,
		provider: schema.SmartDefaultProvider<T>,
	): void;
	addSmartDefaultProvider(
		source: string,
		provider: schema.SmartDefaultProvider<JsonValue>,
	) {
		if (this.#sourceMap.has(source)) {
			throw new Error(
				`There is already a smart default provider for ${JSON.stringify(
					source,
				)}`,
			);
		}

		const isSetup = this.#sourceMap.size > 0;
		this.#sourceMap.set(source, provider);

		if (isSetup) {
			return;
		}

		this.#ajv.addKeyword({
			keyword: '$default',
			errors: false,
			valid: true,
			compile: (schema, _parentSchema, it) => {
				const compilationSchemaInfo = this.#currentCompilationSchemaInfo;
				if (compilationSchemaInfo === undefined) {
					return () => true;
				}

				// We cheat, heavily.
				const pathArray = normalizeDataPathArr(it);
				compilationSchemaInfo.smartDefaultRecord.set(
					JSON.stringify(pathArray),
					schema,
				);

				return () => true;
			},
			metaSchema: {
				type: 'object',
				properties: {
					$source: {type: 'string'},
				},
				additionalProperties: true,
				required: ['$source'],
			},
		});
	}

	registerUriHandler(handler: UriHandler) {
		this.#uriHandlers.add(handler);
	}

	usePromptProvider(provider: schema.PromptProvider) {
		const isSetup = this.#promptProvider != null;
		this.#promptProvider = provider;

		if (isSetup) {
			return;
		}

		this.#ajv.addKeyword({
			keyword: 'x-prompt',
			errors: false,
			valid: true,
			compile: (schema, parentSchema, it) => {
				const compilationSchemaInfo = this.#currentCompilationSchemaInfo;
				if (!compilationSchemaInfo) {
					return () => true;
				}

				const path = '/' + normalizeDataPathArr(it).join('/');

				let type: string | undefined;
				let items:
					| Array<string | {label: string; value: string | number | boolean}>
					| undefined;
				let message: string;
				if (typeof schema == 'string') {
					message = schema;
				} else {
					message = schema.message;
					type = schema.type;
					items = schema.items;
				}

				const propertyTypes = getTypesOfSchema(parentSchema as JsonObject);
				if (!type) {
					if (propertyTypes.size === 1 && propertyTypes.has('boolean')) {
						type = 'confirmation';
					} else if (Array.isArray((parentSchema as JsonObject).enum)) {
						type = 'list';
					} else if (
						propertyTypes.size === 1 &&
						propertyTypes.has('array') &&
						(parentSchema as JsonObject).items &&
						Array.isArray(
							((parentSchema as JsonObject).items as JsonObject).enum,
						)
					) {
						type = 'list';
					} else {
						type = 'input';
					}
				}

				let multiselect;
				if (type === 'list') {
					multiselect =
						schema.multiselect === undefined
							? propertyTypes.size === 1 && propertyTypes.has('array')
							: schema.multiselect;

					const enumValues = multiselect
						? (parentSchema as JsonObject).items &&
						  ((parentSchema as JsonObject).items as JsonObject).enum
						: (parentSchema as JsonObject).enum;
					if (!items && Array.isArray(enumValues)) {
						items = [];
						for (const value of enumValues) {
							if (typeof value == 'string') {
								items.push(value);
							} else if (typeof value == 'object') {
								// Invalid
							} else {
								items.push({label: value.toString(), value});
							}
						}
					}
				}

				const definition: schema.PromptDefinition = {
					id: path,
					type,
					message,
					raw: schema,
					items,
					multiselect,
					propertyTypes,
					default:
						typeof (parentSchema as JsonObject).default == 'object' &&
						(parentSchema as JsonObject).default !== null &&
						!Array.isArray((parentSchema as JsonObject).default)
							? undefined
							: ((parentSchema as JsonObject).default as string[]),
					async validator(data: JsonValue) {
						try {
							const result = (await it.self.validate(
								parentSchema,
								data,
							)) as boolean;
							// If the schema is sync then false will be returned on validation failure
							if (result) {
								return result;
							} else if (it.self.errors?.length) {
								// Validation errors will be present on the Ajv instance when sync
								return it.self.errors[0]!.message!;
							}
						} catch (e) {
							// eslint-disable-next-line no-inner-declarations
							function isErrorObject(
								value: unknown,
							): value is {errors: Error[]} {
								return (
									value != null &&
									Array.isArray((value as {errors: unknown}).errors)
								);
							}
							// If the schema is async then an error will be thrown on validation failure
							if (isErrorObject(e) && e.errors.length) {
								return e.errors[0]!.message;
							}
						}

						return false;
					},
				};

				compilationSchemaInfo.promptDefinitions.push(definition);

				return function (this: {promptFieldsWithValue: Set<string>}) {
					// If 'this' is undefined in the call, then it defaults to the global
					// 'this'.
					if (this && this.promptFieldsWithValue) {
						this.promptFieldsWithValue.add(path);
					}

					return true;
				};
			},
			metaSchema: {
				oneOf: [
					{type: 'string'},
					{
						type: 'object',
						properties: {
							type: {type: 'string'},
							message: {type: 'string'},
						},
						additionalProperties: true,
						required: ['message'],
					},
				],
			},
		});
	}

	async #applyPrompts(
		data: JsonValue,
		prompts: Array<schema.PromptDefinition>,
	): Promise<void> {
		const provider = this.#promptProvider;
		if (!provider) {
			return;
		}

		const answers = await from(provider(prompts)).toPromise();
		for (const path in answers) {
			const pathFragments = path.split('/').slice(1);

			SchemaRegistry.#set(
				data,
				pathFragments,
				answers[path]!,
				null,
				undefined,
				true,
			);
		}
	}

	static #set(
		data: JsonValue,
		fragments: string[],
		value: JsonValue,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		parent: any = null,
		parentProperty?: string,
		force?: boolean,
	): void {
		for (let index = 0; index < fragments.length; index++) {
			const fragment = fragments[index]!;
			if (/^i\d+$/.test(fragment)) {
				if (!Array.isArray(data)) {
					return;
				}

				for (let dataIndex = 0; dataIndex < data.length; dataIndex++) {
					SchemaRegistry.#set(
						data[dataIndex]!,
						fragments.slice(index + 1),
						value,
						data,
						`${dataIndex}`,
					);
				}

				return;
			}

			if (!data && parent !== null && parentProperty) {
				data = parent[parentProperty] = {};
			}

			parent = data;
			parentProperty = fragment;
			data = (data as JsonObject)[fragment]!;
		}

		if (
			parent &&
			parentProperty &&
			(force || parent[parentProperty] === undefined)
		) {
			parent[parentProperty] = value;
		}
	}

	async #applySmartDefaults(
		data: JsonValue,
		smartDefaults: Map<string, JsonObject>,
	): Promise<void> {
		for (const [pointer, schema] of smartDefaults.entries()) {
			const fragments = JSON.parse(pointer);
			const source = this.#sourceMap.get(schema.$source as string);
			if (!source) {
				continue;
			}

			let value = source(schema);
			if (isObservable(value)) {
				value = await firstValueFrom(value);
			}

			SchemaRegistry.#set(data, fragments, value);
		}
	}

	useXDeprecatedProvider(onUsage: (message: string) => void): void {
		const isSetup = this.#deprecationLogger != null;
		this.#deprecationLogger = onUsage;

		if (isSetup) {
			return;
		}

		this.#ajv.addKeyword({
			keyword: 'x-deprecated',
			validate: (schema, _data, _parentSchema, dataCxt) => {
				if (schema) {
					this.#deprecationLogger!(
						`Option "${dataCxt?.parentDataProperty}" is deprecated${
							typeof schema == 'string' ? ': ' + schema : '.'
						}`,
					);
				}

				return true;
			},
			errors: false,
		});
	}
}

function normalizeDataPathArr(it: SchemaObjCxt): (number | string)[] {
	return it.dataPathArr
		.slice(1, it.dataLevel + 1)
		.map(p => (typeof p === 'number' ? p : p.str.replace(/"/g, '')));
}
