import { describe, expect, it } from "vitest";
import { EvaluationError } from "./errors.js";
import { InMemoryEvaluationStore } from "./memory-store.js";
import type { EvaluationEvidenceProvider, VerifierRunner } from "./ports.js";
import { EvaluationService } from "./service.js";
import type { EvaluationDefinition, EvaluationEvidence, EvaluationScope } from "./types.js";

const scope: EvaluationScope = { kind: "project", projectKey: "demo" };

function emptyProvider(evidence: readonly EvaluationEvidence[] = []): EvaluationEvidenceProvider {
	return {
		kind: "test",
		capture: async () => ({ evidence }),
	};
}

function createService(options?: {
	evidence?: readonly EvaluationEvidence[];
	verifierRunner?: VerifierRunner;
}): EvaluationService {
	return new EvaluationService({
		store: new InMemoryEvaluationStore(),
		evidenceProvider: emptyProvider(options?.evidence),
		verifierRunner: options?.verifierRunner,
	});
}

async function seedDefinition(
	service: EvaluationService,
	overrides?: Partial<EvaluationDefinition>,
): Promise<EvaluationDefinition> {
	return service.upsertDefinition(scope, {
		title: overrides?.title ?? "Milestone",
		criteria: overrides?.criteria
			? [...overrides.criteria]
			: [
					{ title: "Build", required: true },
					{ title: "Notes", required: false },
				],
	});
}

describe("EvaluationService attempts", () => {
	it("dedupes identical input fingerprints instead of rewriting an attempt", async () => {
		const evidence: EvaluationEvidence[] = [
			{
				id: "ev-1",
				source: { kind: "trace", traceId: "t1" },
				capturedAt: "2026-01-01T00:00:00.000Z",
				digest: "aa",
				summary: "trace",
			},
		];
		const service = createService({ evidence });
		const definition = await seedDefinition(service);
		const first = await service.run({
			scope,
			definitionId: definition.id,
			trigger: { kind: "manual" },
		});
		const second = await service.run({
			scope,
			definitionId: definition.id,
			trigger: { kind: "manual" },
		});
		expect(second.id).toBe(first.id);
		expect(second.inputFingerprint).toBe(first.inputFingerprint);
		expect(await service.listAttempts(scope)).toHaveLength(1);
	});

	it("refuses to mutate a stored attempt", async () => {
		const store = new InMemoryEvaluationStore();
		const service = new EvaluationService({ store, evidenceProvider: emptyProvider() });
		const definition = await seedDefinition(service);
		const attempt = await service.run({ scope, definitionId: definition.id, trigger: { kind: "manual" } });
		await expect(store.appendAttempt(attempt)).rejects.toMatchObject({ code: "immutable" });
	});

	it("records cancelled attempts when the run is aborted", async () => {
		const controller = new AbortController();
		const service = new EvaluationService({
			store: new InMemoryEvaluationStore(),
			evidenceProvider: {
				kind: "slow",
				capture: async () => {
					controller.abort();
					return { evidence: [] };
				},
			},
		});
		const definition = await seedDefinition(service);
		const attempt = await service.run({
			scope,
			definitionId: definition.id,
			trigger: { kind: "manual" },
			signal: controller.signal,
		});
		expect(attempt.outcome.kind).toBe("cancelled");
	});

	it("settles required verifier crashes as error", async () => {
		const service = createService({
			verifierRunner: {
				async run() {
					throw new Error("boom");
				},
			},
		});
		const definition = await service.upsertDefinition(scope, {
			title: "Crash",
			criteria: [{ title: "Command", required: true, verifier: { kind: "command", command: "false" } }],
		});
		const attempt = await service.run({ scope, definitionId: definition.id, trigger: { kind: "manual" } });
		expect(attempt.findings[0]?.state).toBe("error");
		expect(attempt.outcome.kind).toBe("error");
	});

	it("does not treat model notes as evidence", async () => {
		const service = createService({
			verifierRunner: {
				async run(_verifier, criterionId) {
					return {
						assessment: {
							criterionId,
							state: "passed",
							evidenceIds: [],
							note: "The model said it looked good.",
						},
						evidence: [],
					};
				},
			},
		});
		const definition = await service.upsertDefinition(scope, {
			title: "Review",
			criteria: [
				{
					title: "Looks right",
					required: true,
					verifier: { kind: "assertion", source: "recording-telemetry", expression: "score > 0" },
				},
			],
		});
		const attempt = await service.run({ scope, definitionId: definition.id, trigger: { kind: "manual" } });
		expect(attempt.findings[0]?.note).toContain("model");
		expect(attempt.evidenceIds).toEqual([]);
		expect(attempt.findings[0]?.evidenceIds).toEqual([]);
	});

	it("rejects unknown definitions", async () => {
		const service = createService();
		await expect(service.run({ scope, definitionId: "missing", trigger: { kind: "manual" } })).rejects.toBeInstanceOf(
			EvaluationError,
		);
	});

	it("settles budget-limited when captured evidence exceeds 256 records", async () => {
		const evidence = Array.from({ length: 257 }, (_, index) => ({
			id: `ev-${index}`,
			source: { kind: "trace" as const, traceId: `t-${index}` },
			capturedAt: "2026-01-01T00:00:00.000Z",
			digest: `d-${index}`,
			summary: "trace",
		}));
		const service = createService({ evidence });
		const definition = await seedDefinition(service);
		const attempt = await service.run({ scope, definitionId: definition.id, trigger: { kind: "manual" } });
		expect(attempt.outcome.kind).toBe("budget-limited");
		expect(attempt.evidenceIds).toEqual([]);
	});
});
