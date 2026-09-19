import { atom } from "jotai";

/** Mirrors the validated Coding Agent subagent Session Extension snapshot. */
export interface SubagentTask {
	id: string;
	taskName: string;
	path: string;
	agentType: string;
	status: "queued" | "pending" | "running" | "completed" | "failed" | "interrupted";
	task: string;
	parentSessionId: string;
	sessionFile?: string;
	startedAt: number;
	endedAt?: number;
	finalText?: string;
	errorMessage?: string;
	generation: number;
	todoProgress?: { done: number; total: number };
	/** Human-readable one-line summary for UI display. */
	title?: string;
	/** Aggregate child token/cache/cost usage. Missing on legacy replay events. */
	usage?: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
		costTotal: number;
	};
}

/**
 * Subagent children for the root session.
 * Driven by Coding Agent extension snapshots, keyed by sessionId.
 */
export const subagentsBySessionAtom = atom<Map<string, SubagentTask[]>>(new Map());

export function getSubagentsForSession(
	map: Map<string, SubagentTask[]>,
	sessionId: string | null | undefined,
): SubagentTask[] {
	if (!sessionId) return [];
	return map.get(sessionId) ?? [];
}

export function isSubagentActive(status: SubagentTask["status"]): boolean {
	return status === "queued" || status === "pending" || status === "running";
}
