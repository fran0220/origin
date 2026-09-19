import type { EvaluationDefinition, EvaluationScope, EvaluationTrigger } from "./types.js";

function hexFromBytes(bytes: Uint8Array): string {
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(payload: string): Promise<string> {
	const subtle = globalThis.crypto?.subtle;
	if (!subtle) {
		throw new Error("Evaluation fingerprint requires Web Crypto SHA-256");
	}
	const digest = await subtle.digest("SHA-256", new TextEncoder().encode(payload));
	return hexFromBytes(new Uint8Array(digest));
}

function sortedEvidenceIds(evidenceIds: readonly string[]): readonly string[] {
	return [...evidenceIds].sort();
}

export function fingerprintPayload(
	scope: EvaluationScope,
	definition: EvaluationDefinition,
	trigger: EvaluationTrigger,
	evidenceIds: readonly string[],
): string {
	return JSON.stringify({
		scope,
		definition: {
			id: definition.id,
			revision: definition.revision,
			title: definition.title,
			criteria: definition.criteria,
		},
		trigger,
		evidenceIds: sortedEvidenceIds(evidenceIds),
	});
}

export async function computeInputFingerprint(
	scope: EvaluationScope,
	definition: EvaluationDefinition,
	trigger: EvaluationTrigger,
	evidenceIds: readonly string[],
): Promise<string> {
	return sha256Hex(fingerprintPayload(scope, definition, trigger, evidenceIds));
}
