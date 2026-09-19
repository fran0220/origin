import { beforeEach, describe, expect, it, vi } from "vitest";
import { EVOLUTION_CHANNELS, registerEvolutionIpc } from "./evolution.js";

const ipc = vi.hoisted(() => ({
	handlers: new Map<string, (...args: unknown[]) => unknown>(),
	removed: [] as string[],
}));

vi.mock("electron", () => ({
	ipcMain: {
		handle: (channel: string, handler: (...args: unknown[]) => unknown) => ipc.handlers.set(channel, handler),
		removeHandler: (channel: string) => ipc.removed.push(channel),
	},
}));

function service() {
	return {
		read: vi.fn(async (scope) => ({
			scope,
			revision: 0,
			headDigest: null,
			entries: [],
			budget: { entries: 0, entryLimit: 256, bytes: 0, byteLimit: 192 * 1024 },
		})),
		commit: vi.fn(async () => ({ revision: 1, digest: "sha256:aa", applied: [], rejected: [] })),
		rollback: vi.fn(async () => ({ revision: 2, digest: "sha256:bb", applied: [], rejected: [] })),
		promote: vi.fn(async () => ({ revision: 1, digest: "sha256:cc", applied: [], rejected: [] })),
		history: vi.fn(async () => []),
	};
}

describe("evolution IPC contract", () => {
	beforeEach(() => {
		ipc.handlers.clear();
		ipc.removed.length = 0;
	});

	it("validates renderer input before invoking the ledger service", async () => {
		const deps = service();
		const teardown = registerEvolutionIpc(deps);
		const read = ipc.handlers.get(EVOLUTION_CHANNELS.READ);
		const commit = ipc.handlers.get(EVOLUTION_CHANNELS.COMMIT);
		const rollback = ipc.handlers.get(EVOLUTION_CHANNELS.ROLLBACK);
		const promote = ipc.handlers.get(EVOLUTION_CHANNELS.PROMOTE);
		const history = ipc.handlers.get(EVOLUTION_CHANNELS.HISTORY);
		if (!read || !commit || !rollback || !promote || !history) {
			throw new Error("evolution handlers were not registered");
		}

		await expect(read({}, { kind: "subject" })).rejects.toThrow("evolution.read requires a global or subject scope");
		expect(deps.read).not.toHaveBeenCalled();

		await expect(commit({}, { scope: { kind: "global" } })).rejects.toThrow(
			"evolution.commit requires scope and proposal",
		);
		expect(deps.commit).not.toHaveBeenCalled();

		await expect(rollback({}, { scope: { kind: "global" } })).rejects.toThrow(
			"evolution.rollback requires scope and digest",
		);
		expect(deps.rollback).not.toHaveBeenCalled();

		await expect(promote({}, { subjectId: "proj" })).rejects.toThrow(
			"evolution.promote requires subjectId and entryId",
		);
		expect(deps.promote).not.toHaveBeenCalled();

		await expect(read({}, { kind: "global" })).resolves.toMatchObject({ revision: 0 });
		expect(deps.read).toHaveBeenCalledWith({ kind: "global" });

		const proposal = {
			summary: "keep bazel",
			rationale: "the build used bazel",
			expectedOutcome: "later Turns start from it",
			edits: [{ action: "create", entry: { kind: "prompt", title: "Bazel", content: "use bazel" } }],
		};
		await commit({}, { scope: { kind: "subject", subjectId: "/tmp/game" }, proposal, source: "host" });
		expect(deps.commit).toHaveBeenCalledWith({
			scope: { kind: "subject", subjectId: "/tmp/game" },
			proposal,
			source: "host",
		});

		await rollback({}, { scope: { kind: "global" }, digest: "sha256:aa", reason: "undo" });
		expect(deps.rollback).toHaveBeenCalledWith({ scope: { kind: "global" }, digest: "sha256:aa", reason: "undo" });

		await promote({}, { subjectId: "/tmp/game", entryId: "bazel" });
		expect(deps.promote).toHaveBeenCalledWith({ subjectId: "/tmp/game", entryId: "bazel" });

		await history({}, { scope: { kind: "global" }, limit: 8 });
		expect(deps.history).toHaveBeenCalledWith({ scope: { kind: "global" }, limit: 8 });

		teardown();
		expect(ipc.removed).toEqual([
			EVOLUTION_CHANNELS.READ,
			EVOLUTION_CHANNELS.COMMIT,
			EVOLUTION_CHANNELS.ROLLBACK,
			EVOLUTION_CHANNELS.PROMOTE,
			EVOLUTION_CHANNELS.HISTORY,
		]);
	});
});
