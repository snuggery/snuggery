export function dasherize(str: string): string {
	return str
		.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
		.replace(/[-_.\s]+(.)?/g, (_, char) => (char ? `-${char}` : ""))
		.toLowerCase();
}

export function camelize(str: string): string {
	return str
		.replace(/[-_.\s]+(.)?/g, (_, chr) => {
			return chr?.toUpperCase() ?? "";
		})
		.replace(/^[A-Z]/, (match) => match.toLowerCase());
}
