import {checkConfiguredCollections} from './configured-collections';
import type {DoctorContext} from './context';
import {checkDefaultCollections} from './default-collection';
import {checkProjectsWithSameRoot} from './same-root';

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
