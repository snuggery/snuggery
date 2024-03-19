import {checkConfiguredCollections} from "./configured-collections.js";
import type {DoctorContext} from "./context.js";
import {checkDefaultCollections} from "./default-collection.js";
import {checkProjectsWithSameRoot} from "./same-root.js";

const checks: readonly ((context: DoctorContext) => void | Promise<void>)[] = [
	checkConfiguredCollections,
	checkDefaultCollections,

	checkProjectsWithSameRoot,
];

export async function doctor(context: DoctorContext): Promise<void> {
	for (const check of checks) {
		await check(context);
	}
}
