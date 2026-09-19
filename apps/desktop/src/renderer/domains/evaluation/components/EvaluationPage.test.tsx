// @vitest-environment jsdom

import type {
	EvaluationAttempt,
	EvaluationAttemptView,
	EvaluationDefinition,
	EvaluationEvidence,
} from "@preload/api";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EvaluationPage } from "./EvaluationPage";

const definitions: EvaluationDefinition[] = [];
const attempts: EvaluationAttempt[] = [];
let attemptView: EvaluationAttemptView | null = null;

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}));

vi.mock("@shared/hooks/useOwnedHeaderTitleHidden", () => ({
	useOwnedHeaderTitleHidden: () => undefined,
}));

function evidence(id: string): EvaluationEvidence {
	return {
		id,
		source: { kind: "execution-receipt", executionId: id },
		capturedAt: "2026-01-01T00:00:00.000Z",
		digest: "deadbeef",
		summary: `receipt ${id}`,
	};
}

beforeEach(() => {
	definitions.splice(0);
	attempts.splice(0);
	attemptView = null;
	vi.stubGlobal("vetta", {
		evaluation: {
			listDefinitions: vi.fn(async () => [...definitions]),
			listAttempts: vi.fn(async () => [...attempts]),
			upsertDefinition: vi.fn(async (_scope: unknown, input: { title: string; criteria: Array<{ title: string; required: boolean }> }) => {
				const definition: EvaluationDefinition = {
					id: "def-1",
					revision: 1,
					title: input.title,
					criteria: input.criteria.map((criterion, index) => ({
						id: `c${index + 1}`,
						title: criterion.title,
						required: criterion.required,
					})),
					updatedAt: "2026-01-01T00:00:00.000Z",
				};
				definitions.splice(0, definitions.length, definition);
				return definition;
			}),
			run: vi.fn(async () => {
				const cited = evidence("ev-fail");
				const attempt: EvaluationAttempt = {
					id: "attempt-1",
					scope: { kind: "global" },
					definitionId: "def-1",
					definitionRevision: 1,
					trigger: { kind: "manual" },
					inputFingerprint: "fp",
					evidenceIds: [cited.id],
					findings: [
						{ criterionId: "c1", state: "failed", evidenceIds: [cited.id] },
						{ criterionId: "c2", state: "passed", evidenceIds: [] },
					],
					outcome: { kind: "failed", settledAt: "2026-01-01T00:00:01.000Z" },
					createdAt: "2026-01-01T00:00:01.000Z",
				};
				attempts.splice(0, attempts.length, attempt);
				attemptView = {
					attempt,
					definition: definitions[0]!,
					evidence: [cited],
				};
				return attempt;
			}),
			get: vi.fn(async () => {
				if (!attemptView) throw new Error("missing attempt");
				return attemptView;
			}),
			cancel: vi.fn(async () => undefined),
		},
	});
});

describe("EvaluationPage user flow", () => {
	it("creates a definition with one required criterion, runs it, and opens failed evidence", async () => {
		const user = userEvent.setup();
		render(<EvaluationPage />);

		await waitFor(() => {
			expect(screen.getByRole("heading", { name: "empty.title" })).toBeTruthy();
		});

		await user.click(screen.getByRole("button", { name: "empty.action" }));
		await user.type(screen.getByPlaceholderText("definition.titlePlaceholder"), "Build check");
		const inputs = screen.getAllByRole("textbox");
		await user.type(inputs[1]!, "Must compile");
		await user.type(inputs[2]!, "test");
		await user.type(inputs[3]!, "-f missing.txt");
		await user.type(inputs[4]!, "Optional notes");
		await user.click(screen.getByRole("button", { name: "page.save" }));

		await waitFor(() => {
			expect(screen.getByText("Build check")).toBeTruthy();
		});

		await user.click(screen.getByText("Build check"));
		await user.click(screen.getByRole("button", { name: "page.run" }));

		await waitFor(() => {
			expect(screen.getAllByText("outcome.failed").length).toBeGreaterThan(0);
			expect(screen.getByText("Must compile")).toBeTruthy();
			expect(screen.getByRole("link", { name: /finding.openEvidence/ }).getAttribute("href")).toBe(
				"#evidence-ev-fail",
			);
		});
		expect(screen.getByText("receipt ev-fail")).toBeTruthy();
	});
});
