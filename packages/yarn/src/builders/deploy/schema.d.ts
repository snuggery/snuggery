export interface Schema {
	useWorkspacePlugin?: boolean;

	buildTarget?: string;

	include?: string | string[];

	exclude?: string | string[];

	distTag?: string;
}
