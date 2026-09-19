import type { RefinementProposal } from "@origin/runtime-evolution";
import { ipcMain } from "electron";
import { DesktopEvolutionService, type EvolutionScopeInput } from "../evolution/evolution-service.js";

const CHANNELS = {
	READ: "vetta:evolution:read",
	COMMIT: "vetta:evolution:commit",
	ROLLBACK: "vetta:evolution:rollback",
	PROMOTE: "vetta:evolution:promote",
	HISTORY: "vetta:evolution:history",
} as const;

function isScope(value: unknown): value is EvolutionScopeInput {
	if (!value || typeof value !== "object") return false;
	const record = value as { kind?: unknown; subjectId?: unknown };
	if (record.kind === "global") return true;
	return record.kind === "subject" && typeof record.subjectId === "string" && record.subjectId.trim().length > 0;
}

function isProposal(value: unknown): value is RefinementProposal {
	if (!value || typeof value !== "object") return false;
	const record = value as { summary?: unknown; rationale?: unknown; expectedOutcome?: unknown; edits?: unknown };
	return (
		typeof record.summary === "string" &&
		typeof record.rationale === "string" &&
		typeof record.expectedOutcome === "string" &&
		Array.isArray(record.edits)
	);
}

export type EvolutionIpcService = Pick<DesktopEvolutionService, "read" | "commit" | "rollback" | "promote" | "history">;

export function registerEvolutionIpc(service: EvolutionIpcService = new DesktopEvolutionService()): () => void {
	ipcMain.handle(CHANNELS.READ, async (_event, scope: unknown) => {
		if (!isScope(scope)) throw new Error("evolution.read requires a global or subject scope");
		return service.read(scope);
	});
	ipcMain.handle(CHANNELS.COMMIT, async (_event, payload: unknown) => {
		if (!payload || typeof payload !== "object") throw new Error("evolution.commit requires a payload");
		const record = payload as { scope?: unknown; proposal?: unknown; source?: unknown };
		if (!isScope(record.scope) || !isProposal(record.proposal)) {
			throw new Error("evolution.commit requires scope and proposal");
		}
		return service.commit({
			scope: record.scope,
			proposal: record.proposal,
			source: typeof record.source === "string" ? record.source : undefined,
		});
	});
	ipcMain.handle(CHANNELS.ROLLBACK, async (_event, payload: unknown) => {
		if (!payload || typeof payload !== "object") throw new Error("evolution.rollback requires a payload");
		const record = payload as { scope?: unknown; digest?: unknown; reason?: unknown };
		if (!isScope(record.scope) || typeof record.digest !== "string") {
			throw new Error("evolution.rollback requires scope and digest");
		}
		return service.rollback({
			scope: record.scope,
			digest: record.digest,
			reason: typeof record.reason === "string" ? record.reason : undefined,
		});
	});
	ipcMain.handle(CHANNELS.PROMOTE, async (_event, payload: unknown) => {
		if (!payload || typeof payload !== "object") throw new Error("evolution.promote requires a payload");
		const record = payload as { subjectId?: unknown; entryId?: unknown };
		if (typeof record.subjectId !== "string" || typeof record.entryId !== "string") {
			throw new Error("evolution.promote requires subjectId and entryId");
		}
		return service.promote({ subjectId: record.subjectId, entryId: record.entryId });
	});
	ipcMain.handle(CHANNELS.HISTORY, async (_event, payload: unknown) => {
		if (!payload || typeof payload !== "object") throw new Error("evolution.history requires a payload");
		const record = payload as { scope?: unknown; limit?: unknown };
		if (!isScope(record.scope)) throw new Error("evolution.history requires a scope");
		return service.history({
			scope: record.scope,
			limit: typeof record.limit === "number" ? record.limit : undefined,
		});
	});
	return () => {
		ipcMain.removeHandler(CHANNELS.READ);
		ipcMain.removeHandler(CHANNELS.COMMIT);
		ipcMain.removeHandler(CHANNELS.ROLLBACK);
		ipcMain.removeHandler(CHANNELS.PROMOTE);
		ipcMain.removeHandler(CHANNELS.HISTORY);
	};
}

export { CHANNELS as EVOLUTION_CHANNELS };
