export {
	type ExtraConfigurationDefinition,
	type ExtraConfigurationDefinitionWithType,
	extractExtraConfiguration,
} from "./extract-extra-configuration";
export {findUp} from "./workspace/find-up";
export {filterByPatterns, matchesPatterns, type Patterns} from "./pattern";
export {
	type ConvertibleWorkspaceDefinition,
	type MiniWorkspaceOptions,
	type ProjectDefinition,
	ProjectDefinitionCollection,
	type TargetDefinition,
	TargetDefinitionCollection,
	type WorkspaceDefinition,
	type WorkspaceHost,
	nodeFsHost,
	workspaceFilenames,
	findMiniWorkspace,
	findWorkspace,
	isJsonArray,
	isJsonObject,
	getPrintableType,
	readMiniWorkspace,
	readWorkspace,
	writeWorkspace,
	updateWorkspace,
	type JsonObject,
	type JsonPropertyName,
	type JsonPropertyPath,
	type JsonValue,
} from "./workspace";
