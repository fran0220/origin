import { describe, expect, it } from "vitest";
import {
	isCurrentAttemptWrite,
	isCurrentDefinitionWrite,
	parseEvaluationAttemptRecord,
	parseEvaluationDefinitionRecord,
	parseEvaluationEvidenceRecord,
	toAttemptRecord,
	toDefinitionRecord,
	toEvidenceRecord,
} from "./schema.js";
import type { EvaluationAttempt, EvaluationDefinition, EvaluationEvidence } from "./types.js";

const definition: EvaluationDefinition = {
	id: "def-1",
	revision: 1,
	title: "Build",
	criteria: [{ id: "c1", title: "Compiles", required: true }],
	updatedAt: "2026-01-01T00:00:00.000Z",
};

const attempt: EvaluationAttempt = {
	id: "evaluation-1",
	scope: { kind: "global" },
	definitionId: "def-1",
	definitionRevision: 1,
	trigger: { kind: "manual" },
	inputFingerprint: "abc",
	evidenceIds: ["ev-1"],
	findings: [{ criterionId: "c1", state: "passed", evidenceIds: ["ev-1"] }],
	outcome: { kind: "passed", settledAt: "2026-01-01T00:00:00.000Z" },
	createdAt: "2026-01-01T00:00:00.000Z",
};

const evidence: EvaluationEvidence = {
	id: "ev-1",
	source: { kind: "trace", traceId: "tr-1" },
	capturedAt: "2026-01-01T00:00:00.000Z",
	digest: "deadbeef",
	summary: "trace completed",
};

describe("Evaluation schema current-write / compatible-read", () => {
	it("round-trips current writes", () => {
		expect(isCurrentDefinitionWrite(toDefinitionRecord(definition))).toBe(true);
		expect(isCurrentAttemptWrite(toAttemptRecord(attempt))).toBe(true);
		expect(parseEvaluationDefinitionRecord(toDefinitionRecord(definition))).toEqual(definition);
		expect(parseEvaluationAttemptRecord(toAttemptRecord(attempt))).toEqual(attempt);
		expect(parseEvaluationEvidenceRecord(toEvidenceRecord(evidence))).toEqual(evidence);
	});

	it("reads future additive fields without failing", () => {
		const futureDefinition = { ...toDefinitionRecord(definition), extra: "ignored", schemaVersion: 1 };
		const futureAttempt = { ...toAttemptRecord(attempt), extra: { nested: true }, schemaVersion: 1 };
		expect(parseEvaluationDefinitionRecord(futureDefinition)).toEqual(definition);
		expect(parseEvaluationAttemptRecord(futureAttempt)).toEqual(attempt);
	});

	it("rejects records missing required identity", () => {
		expect(parseEvaluationDefinitionRecord({ ...toDefinitionRecord(definition), id: "" })).toBeUndefined();
		expect(parseEvaluationAttemptRecord({ ...toAttemptRecord(attempt), findings: "nope" })).toBeUndefined();
		expect(parseEvaluationEvidenceRecord({ ...toEvidenceRecord(evidence), digest: "" })).toBeUndefined();
	});
});
