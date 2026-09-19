import { HOME_SUBJECT_ID } from "@vetta/runtime-evolution";

export function resolveHarnessSubjectId(input: {
	readonly cwd?: string;
	readonly homeCwd?: string;
	readonly projectId?: string;
}): string {
	if (input.projectId?.trim()) return input.projectId.trim();
	const cwd = input.cwd?.trim();
	const homeCwd = input.homeCwd?.trim();
	if (!cwd || !homeCwd) return HOME_SUBJECT_ID;
	const normalize = (value: string) => value.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
	return normalize(cwd) === normalize(homeCwd) ? HOME_SUBJECT_ID : cwd;
}
