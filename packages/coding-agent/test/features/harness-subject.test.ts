import { describe, expect, it } from "vitest";
import { resolveHarnessSubjectId } from "../../src/features/harness/index.js";

describe("resolveHarnessSubjectId", () => {
	it("uses home when cwd is missing or matches the Home workspace", () => {
		expect(resolveHarnessSubjectId({})).toBe("home");
		expect(resolveHarnessSubjectId({ cwd: "/tmp/home", homeCwd: "/tmp/home" })).toBe("home");
		expect(resolveHarnessSubjectId({ cwd: "/tmp/home/", homeCwd: "/tmp/home" })).toBe("home");
	});

	it("uses the project path when cwd is a registered project workspace", () => {
		expect(resolveHarnessSubjectId({ cwd: "/tmp/game", homeCwd: "/tmp/home" })).toBe("/tmp/game");
		expect(resolveHarnessSubjectId({ projectId: "/canonical/game", cwd: "/tmp/game" })).toBe("/canonical/game");
	});
});
