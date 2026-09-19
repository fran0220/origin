import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { ExecutionReceipt, MainlineCheckpoint } from "@origin/runtime-checkpoints";
import type { EvaluationEvidence, EvaluationEvidenceProvider } from "@origin/runtime-evaluation";
import { sha256Json, sha256Text } from "@origin/runtime-node/evaluation";
import { FileRecordingStore } from "@origin/runtime-node/recording";
import type { RecordingRecord } from "@origin/runtime-recording";

interface EvidenceProject {
	readonly checkpointProjectKeys: readonly string[];
	readonly recordingProjectKeys: readonly string[];
}

interface CheckpointEvidenceReader {
	list(projectKey: string): Promise<readonly MainlineCheckpoint[]>;
	listReceipts(projectKey: string): Promise<readonly ExecutionReceipt[]>;
}

interface PlatformEvidenceOptions {
	readonly resolveProject: (scopeKey: string) => Promise<EvidenceProject | undefined>;
	readonly checkpoints: () => CheckpointEvidenceReader;
	readonly recordingRoot: () => string;
}

/** Joins durable platform records without treating a trigger reference as a file path or session ID. */
export function createPlatformEvaluationEvidenceProvider(options: PlatformEvidenceOptions): EvaluationEvidenceProvider {
	return {
		kind: "platform",
		async capture(scopeKey, trigger) {
			const project = await options.resolveProject(scopeKey);
			if (!project) return { evidence: [] };
			const checkpoints = options.checkpoints();
			const records = (await Promise.all(project.checkpointProjectKeys.map((key) => checkpoints.list(key)))).flat();
			const checkpoint = records
				.filter((record) =>
					trigger.kind === "checkpoint"
						? record.id === trigger.ref
						: trigger.kind === "turn"
							? record.turnId === trigger.ref
							: true,
				)
				.sort((left, right) => right.createdAt - left.createdAt)[0];
			if (trigger.kind === "checkpoint" && !checkpoint) return { evidence: [] };
			const allReceipts = (
				await Promise.all(project.checkpointProjectKeys.map((key) => checkpoints.listReceipts(key)))
			).flat();
			const latestReceipt = [...allReceipts].sort((left, right) => right.endedAt - left.endedAt)[0];
			const turnId = trigger.kind === "turn" ? trigger.ref : (checkpoint?.turnId ?? latestReceipt?.turnId);
			const sessionId = checkpoint?.sessionId ?? (trigger.kind === "turn" ? undefined : latestReceipt?.sessionId);
			const receipts = allReceipts.filter(
				(item) => item.turnId === turnId && (!sessionId || item.sessionId === sessionId),
			);
			const evidence: EvaluationEvidence[] = receipts.map((receipt) => ({
				id: `receipt:${receipt.executionId}`,
				source: {
					kind: "execution-receipt",
					executionId: receipt.executionId,
					...(scopeKey.startsWith("project:") ? { projectKey: scopeKey.slice("project:".length) } : {}),
				},
				capturedAt: new Date(receipt.endedAt).toISOString(),
				digest: sha256Json(receipt),
				summary: `${receipt.command} in ${receipt.cwd} → ${JSON.stringify(receipt.outcome)}`,
			}));
			if (checkpoint) {
				const digest = sha256Json(checkpoint);
				evidence.push({
					id: `checkpoint:${checkpoint.id}:${digest}`,
					source: { kind: "checkpoint", checkpointId: checkpoint.id, projectKey: checkpoint.projectKey },
					capturedAt: new Date(checkpoint.updatedAt).toISOString(),
					digest,
					summary: `checkpoint ${checkpoint.phase}${checkpoint.decision ? ` ${checkpoint.decision}` : ""}`,
				});
			}
			const root = options.recordingRoot();
			const store = new FileRecordingStore({ rootDirectory: root });
			const recordings = (await store.list()).filter((record) => {
				if (record.status !== "ready" || !project.recordingProjectKeys.includes(record.projectKey)) return false;
				if (trigger.kind !== "turn" && trigger.kind !== "checkpoint") return true;
				// A recording has no turnId. Only attach it when receipts establish its session and time interval.
				const sameSession = receipts.filter((receipt) => receipt.sessionId === record.sessionId);
				if (sameSession.length === 0) return false;
				const start = Math.min(...sameSession.map((receipt) => receipt.startedAt));
				const end = Math.max(checkpoint?.updatedAt ?? 0, ...sameSession.map((receipt) => receipt.endedAt));
				return record.startedAt >= start && record.endedAt !== undefined && record.endedAt <= end;
			});
			const requested =
				trigger.kind === "manual" ? recordings.find((record) => record.id === trigger.ref) : undefined;
			// Preserve ambiguity for the verifier; a milestone reference is not a recording ID.
			for (const recording of requested ? [requested] : recordings) {
				const captured = await recordingEvidence(root, store.directoryFor(recording), recording);
				if (captured) evidence.push(captured);
			}
			return { evidence: [...new Map(evidence.map((item) => [item.id, item])).values()] };
		},
	};
}

async function recordingEvidence(
	root: string,
	directory: string,
	record: RecordingRecord,
): Promise<EvaluationEvidence | undefined> {
	try {
		const realRoot = await realpath(root);
		const realDirectory = await realpath(directory);
		assertWithin(realRoot, realDirectory);
		const telemetryPath = await realpath(resolve(realDirectory, record.telemetryPath));
		assertWithin(realDirectory, telemetryPath);
		const digest = sha256Text(await readFile(telemetryPath, "utf8"));
		return {
			id: `recording:${record.id}:${digest}`,
			source: { kind: "recording", recordingId: record.id, projectKey: record.projectKey, telemetryPath },
			capturedAt: new Date(record.endedAt ?? record.startedAt).toISOString(),
			digest,
			summary: `recording ${record.status}`,
		};
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
		throw error;
	}
}

function assertWithin(root: string, path: string): void {
	const subpath = relative(root, path);
	if (!subpath || subpath === ".." || subpath.startsWith(`..${sep}`) || isAbsolute(subpath)) {
		throw new Error("Recording evidence is outside its recording directory");
	}
}
