import type { CheckpointIdFactory } from "./ports.js";

export function createCheckpointIdFactory(now: () => number = Date.now): CheckpointIdFactory {
	let sequence = 0;
	return {
		checkpointId: () => `cp_${now().toString(36)}_${nextToken(++sequence)}`,
		operationId: () => `op_${now().toString(36)}_${nextToken(++sequence)}`,
		executionId: (projectKey, operationId, commandIndex) =>
			`checkpoint-${fnv1aHex(`${projectKey}\0${operationId}\0${commandIndex}`)}`,
	};
}

export function proposeOperationId(sessionId: string, turnId: string): string {
	return `turn:${sessionId}:${turnId}`;
}

function nextToken(sequence: number): string {
	return `${sequence.toString(36)}${Math.floor(Math.random() * 1_679_616)
		.toString(36)
		.padStart(4, "0")}`;
}

function fnv1aHex(value: string): string {
	let hash = 0x811c9dc5;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}
