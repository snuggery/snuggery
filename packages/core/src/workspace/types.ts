export {
	InvalidConfigurationError,
	UnsupportedOperationError,
} from './types/error';
export {
	type JsonObject,
	type JsonPropertyName,
	type JsonPropertyPath,
	type JsonValue,
	getPrintableType,
	isJsonArray,
	isJsonObject,
	stringifyPath,
} from './types/json';
export {
	ConvertibleWorkspaceDefinition,
	type ProjectDefinition,
	ProjectDefinitionCollection,
	type TargetDefinition,
	TargetDefinitionCollection,
	type WorkspaceDefinition,
	type WorkspaceHandle,
} from './types/workspace';
