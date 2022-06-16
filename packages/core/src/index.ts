export {
	type ExtraConfigurationDefinition,
	type ExtraConfigurationDefinitionWithType,
	extractExtraConfiguration,
} from './extract-extra-configuration';
export {filterByPatterns} from './pattern';
export {
	type ConvertibleWorkspaceDefinition,
	type ProjectDefinition,
	ProjectDefinitionCollection,
	type TargetDefinition,
	TargetDefinitionCollection,
	type WorkspaceDefinition,
	type WorkspaceHost,
	workspaceFilenames,
	isJsonArray,
	isJsonObject,
	getPrintableType,
	readWorkspace,
	writeWorkspace,
	updateWorkspace,
	type JsonObject,
	type JsonPropertyName,
	type JsonPropertyPath,
	type JsonValue,
} from './workspace';
