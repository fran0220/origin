import { describe, expect, it } from "vitest";
import { toHostEvaluationScope } from "./plugin-evaluation-scope";

describe("plugin evaluation scope mapping", () => {
	it("forwards a project key and falls back to global without inventing one", () => {
		expect(toHostEvaluationScope({ kind: "project", projectKey: "eval-key" })).toEqual({
			kind: "project",
			projectKey: "eval-key",
		});
		expect(toHostEvaluationScope({ kind: "project" })).toEqual({ kind: "global" });
		expect(toHostEvaluationScope({ kind: "global" })).toEqual({ kind: "global" });
		expect(toHostEvaluationScope()).toEqual({ kind: "global" });
	});
});
