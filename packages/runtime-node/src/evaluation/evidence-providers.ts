import type {
	ArtifactDigestSnapshot,
	CheckpointSnapshot,
	EvaluationCapture,
	EvaluationEvidence,
	EvaluationEvidenceProvider,
	EvaluationTrigger,
	ExecutionReceiptSnapshot,
	RecordingSnapshot,
	TraceSnapshot,
} from "@vetta/runtime-evaluation";
import { sha256Json } from "./digest.js";

export interface ExecutionReceiptLookup {
	list(scopeKey: string, trigger: EvaluationTrigger): Promise<readonly ExecutionReceiptSnapshot[]>;
}

export interface CheckpointLookup {
	list(scopeKey: string, trigger: EvaluationTrigger): Promise<readonly CheckpointSnapshot[]>;
}

export interface TraceLookup {
	list(scopeKey: string, trigger: EvaluationTrigger): Promise<readonly TraceSnapshot[]>;
}

export interface ArtifactDigestLookup {
	list(scopeKey: string, trigger: EvaluationTrigger): Promise<readonly ArtifactDigestSnapshot[]>;
}

export interface RecordingLookup {
	list(scopeKey: string, trigger: EvaluationTrigger): Promise<readonly RecordingSnapshot[]>;
}

export function createExecutionReceiptEvidenceProvider(lookup: ExecutionReceiptLookup): EvaluationEvidenceProvider {
	return {
		kind: "execution-receipt",
		async capture(scopeKey, trigger): Promise<EvaluationCapture> {
			const receipts = await lookup.list(scopeKey, trigger);
			return {
				evidence: receipts.map((receipt) =>
					evidence({
						id: `receipt:${receipt.executionId}`,
						source: {
							kind: "execution-receipt",
							executionId: receipt.executionId,
							...(projectKeyFromScope(scopeKey) ? { projectKey: projectKeyFromScope(scopeKey) } : {}),
						},
						capturedAt: receipt.endedAt,
						digest: sha256Json(receipt),
						summary: summarizeReceipt(receipt),
					}),
				),
			};
		},
	};
}

export function createCheckpointEvidenceProvider(lookup: CheckpointLookup): EvaluationEvidenceProvider {
	return {
		kind: "checkpoint",
		async capture(scopeKey, trigger): Promise<EvaluationCapture> {
			const checkpoints = await lookup.list(scopeKey, trigger);
			return {
				evidence: checkpoints.map((checkpoint) =>
					evidence({
						id: `checkpoint:${checkpoint.id}`,
						source: { kind: "checkpoint", checkpointId: checkpoint.id, projectKey: checkpoint.projectKey },
						capturedAt: new Date().toISOString(),
						digest: sha256Json(checkpoint),
						summary: summarizeCheckpoint(checkpoint),
					}),
				),
			};
		},
	};
}

export function createTraceEvidenceProvider(lookup: TraceLookup): EvaluationEvidenceProvider {
	return {
		kind: "trace",
		async capture(scopeKey, trigger): Promise<EvaluationCapture> {
			const traces = await lookup.list(scopeKey, trigger);
			return {
				evidence: traces.map((trace) =>
					evidence({
						id: `trace:${trace.id}`,
						source: {
							kind: "trace",
							traceId: trace.traceId,
							spanId: trace.id,
							sessionId: trace.sessionId,
						},
						capturedAt: new Date(trace.startedAt).toISOString(),
						digest: sha256Json(trace),
						summary: `${trace.name} ${trace.state}`,
					}),
				),
			};
		},
	};
}

export function createArtifactDigestEvidenceProvider(lookup: ArtifactDigestLookup): EvaluationEvidenceProvider {
	return {
		kind: "artifact",
		async capture(scopeKey, trigger): Promise<EvaluationCapture> {
			const artifacts = await lookup.list(scopeKey, trigger);
			return {
				evidence: artifacts.map((artifact) =>
					evidence({
						id: `artifact:${artifact.artifactId}`,
						source: {
							kind: "artifact",
							artifactId: artifact.artifactId,
							digest: artifact.digest,
							path: artifact.path,
						},
						capturedAt: new Date().toISOString(),
						digest: artifact.digest,
						summary: artifact.summary,
					}),
				),
			};
		},
	};
}

/**
 * Recording 适配器。`runtime-recording` 未落地时 lookup 返回空集；
 * ref 形状已在 `@vetta/runtime-evaluation` 固定。
 */
export function createRecordingEvidenceProvider(lookup?: RecordingLookup): EvaluationEvidenceProvider {
	return {
		kind: "recording",
		async capture(scopeKey, trigger): Promise<EvaluationCapture> {
			const recordings = lookup ? await lookup.list(scopeKey, trigger) : [];
			return {
				evidence: recordings.map((recording) =>
					evidence({
						id: `recording:${recording.id}`,
						source: {
							kind: "recording",
							recordingId: recording.id,
							projectKey: recording.projectKey,
							telemetryPath: recording.telemetryPath,
						},
						capturedAt: new Date().toISOString(),
						digest: sha256Json(recording),
						summary: `recording ${recording.status}`,
					}),
				),
			};
		},
	};
}

function evidence(value: EvaluationEvidence): EvaluationEvidence {
	return value;
}

function projectKeyFromScope(scopeKey: string): string | undefined {
	return scopeKey.startsWith("project:") ? scopeKey.slice("project:".length) : undefined;
}

function summarizeReceipt(receipt: ExecutionReceiptSnapshot): string {
	const outcome =
		typeof receipt.outcome === "object" && receipt.outcome !== null
			? JSON.stringify(receipt.outcome)
			: String(receipt.outcome);
	return `${receipt.command} in ${receipt.cwd} → ${outcome}`;
}

function summarizeCheckpoint(checkpoint: CheckpointSnapshot): string {
	const landed = checkpoint.landed?.commit ? ` commit ${checkpoint.landed.commit}` : "";
	return `checkpoint ${checkpoint.phase}${checkpoint.decision ? ` ${checkpoint.decision}` : ""}${landed}`;
}
