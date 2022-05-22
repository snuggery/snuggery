export type RequiredProperties<T, K extends keyof T> = T & {
	[key in K]-?: T[K];
};
