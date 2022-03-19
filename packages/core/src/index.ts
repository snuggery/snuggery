export {
	ExtraConfigurationDefinition,
	ExtraConfigurationDefinitionWithType,
	extractExtraConfiguration,
} from './extract-extra-configuration';
export {filterByPatterns} from './pattern';
export {
	ConvertibleWorkspaceDefinition,
	ProjectDefinition,
	ProjectDefinitionCollection,
	TargetDefinition,
	TargetDefinitionCollection,
	WorkspaceDefinition,
	WorkspaceHost,
	workspaceFilenames,
	isJsonArray,
	isJsonObject,
	getPrintableType,
	readWorkspace,
	writeWorkspace,
	updateWorkspace,
	JsonObject,
	JsonPropertyName,
	JsonPropertyPath,
	JsonValue,
} from './workspace';
