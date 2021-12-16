export interface VersionControlSystem {
	getChangedFiles(opts: {
		from?: string;
		to?: string;
		exclude?: string[];
	}): Promise<Set<string>>;
}

export interface VersionControlFactory {
	create(opts: {location: string}): Promise<VersionControlSystem | null>;
}
