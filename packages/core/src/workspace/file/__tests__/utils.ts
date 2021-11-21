import type {WorkspaceHost} from '../types';

export class TestSingleFileWorkspaceHost implements WorkspaceHost {
	readonly #path: string;

	#currentContent: string;

	constructor(path: string, originalContent: string) {
		this.#path = path;
		this.#currentContent = originalContent;
	}

	get currentContent() {
		return this.#currentContent;
	}

	async isDirectory() {
		return false;
	}

	async isFile(path: string) {
		return path === this.#path;
	}

	async readdir(): Promise<never> {
		throw new Error('Unexpected readdir');
	}

	async read(path: string) {
		if (path !== this.#path) {
			throw new Error(`Unexpected read: ${path}`);
		}

		return this.#currentContent;
	}

	async write(path: string, content: string) {
		if (path !== this.#path) {
			throw new Error(`Unexpected write: ${path}`);
		}

		this.#currentContent = content;
	}
}
