import { describe, expect, it } from "vitest";
import { aggregateOutcome, findingsForCriteria } from "./aggregation.js";
import type { EvaluationCriterion, EvaluationFinding } from "./types.js";

const required: EvaluationCriterion = { id: "build", title: "Build", required: true };
const optional: EvaluationCriterion = { id: "style", title: "Style", required: false };

function finding(criterionId: string, state: EvaluationFinding["state"]): EvaluationFinding {
	return { criterionId, state, evidenceIds: state === "inconclusive" ? [] : ["ev-1"] };
}

describe("Evaluation aggregation", () => {
	it("passes only when every required criterion passed", () => {
		const outcome = aggregateOutcome(
			[required, optional],
			[finding("build", "passed"), finding("style", "failed")],
			"2026-01-01T00:00:00.000Z",
		);
		expect(outcome.kind).toBe("passed");
	});

	it("fails when any required criterion failed", () => {
		const outcome = aggregateOutcome(
			[required, optional],
			[finding("build", "failed"), finding("style", "passed")],
			"2026-01-01T00:00:00.000Z",
		);
		expect(outcome.kind).toBe("failed");
	});

	it("is inconclusive when a required criterion is missing a finding", () => {
		const findings = findingsForCriteria(
			[required, optional],
			[{ criterionId: "style", state: "passed", evidenceIds: ["ev-1"] }],
		);
		expect(findings).toEqual([
			{ criterionId: "build", state: "inconclusive", evidenceIds: [] },
			{ criterionId: "style", state: "passed", evidenceIds: ["ev-1"] },
		]);
		expect(aggregateOutcome([required, optional], findings, "2026-01-01T00:00:00.000Z").kind).toBe("inconclusive");
	});

	it("is inconclusive when a required finding has no evidence", () => {
		const outcome = aggregateOutcome(
			[required],
			[{ criterionId: "build", state: "inconclusive", evidenceIds: [] }],
			"2026-01-01T00:00:00.000Z",
		);
		expect(outcome.kind).toBe("inconclusive");
	});

	it("is error when a required verifier crashed", () => {
		const outcome = aggregateOutcome([required], [finding("build", "error")], "2026-01-01T00:00:00.000Z");
		expect(outcome.kind).toBe("error");
	});

	it("prefers error over failed for required criteria", () => {
		const second: EvaluationCriterion = { id: "tests", title: "Tests", required: true };
		const outcome = aggregateOutcome(
			[required, second],
			[finding("build", "failed"), finding("tests", "error")],
			"2026-01-01T00:00:00.000Z",
		);
		expect(outcome.kind).toBe("error");
	});

	it("ignores optional failures when required criteria passed", () => {
		const outcome = aggregateOutcome(
			[required, optional],
			[finding("build", "passed"), finding("style", "error")],
			"2026-01-01T00:00:00.000Z",
		);
		expect(outcome.kind).toBe("passed");
	});

	it("is inconclusive when there are no required criteria", () => {
		const outcome = aggregateOutcome([optional], [finding("style", "passed")], "2026-01-01T00:00:00.000Z");
		expect(outcome.kind).toBe("inconclusive");
	});

	it("records cancelled and budget-limited as terminal overrides", () => {
		expect(aggregateOutcome([required], [finding("build", "passed")], "t", "cancelled").kind).toBe("cancelled");
		expect(aggregateOutcome([required], [finding("build", "passed")], "t", "budget-limited").kind).toBe(
			"budget-limited",
		);
	});
});
