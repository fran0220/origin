import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { encodeProjectKey, HOME_CHECKPOINT_PROJECT_KEY } from "../checkpoints/project-key.js";
import { DEFAULT_CONVERSATION_CWD } from "../config/desktop-config-store.js";
import {
	lookupCapabilityProjectByEvaluationScopeKey,
	resolveCapabilityProject,
	resolveCapabilityProjectKeysForEvaluationScope,
	resolveDesktopCapabilityProject,
	resolveDesktopCapabilityProjectKeysForEvaluationScope,
} from "./capability-project.js";

function sha256(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

describe("resolveCapabilityProject", () => {
	it("isolates Home from project storage keys", () => {
		const home = resolveCapabilityProject("", [{ path: "/games/demo" }], "/tmp/home");
		expect(home).toEqual({
			cwd: "/tmp/home",
			evaluationScope: { kind: "global" },
			checkpointProjectKey: HOME_CHECKPOINT_PROJECT_KEY,
			recordingProjectKey: "home",
		});
		expect(resolveCapabilityProject("/tmp/home", [{ path: "/games/demo" }], "/tmp/home").evaluationScope).toEqual({
			kind: "global",
		});
		const project = resolveCapabilityProject("/games/demo", [{ path: "/games/demo" }], "/tmp/home");
		expect(project.evaluationScope).toEqual({ kind: "project", projectKey: sha256("/games/demo").slice(0, 16) });
		expect(project.checkpointProjectKey).toBe(encodeProjectKey("/games/demo"));
		expect(project.recordingProjectKey).toBe(sha256("/games/demo").slice(0, 16));
		expect(project.checkpointProjectKey).not.toBe(home.checkpointProjectKey);
		expect(project.recordingProjectKey).not.toBe(home.recordingProjectKey);
	});

	it("aligns Windows casing and separators to the registered spelling", () => {
		const registered = "C:\\Projects\\Selected";
		const descriptor = resolveCapabilityProject("c:/projects/selected/", [{ path: registered }], "C:\\home");
		expect(descriptor.cwd).toBe(registered);
		expect(descriptor.checkpointProjectKey).toBe(encodeProjectKey(registered));
		expect(descriptor.recordingProjectKey).toBe(sha256(registered).slice(0, 16));
	});

	it("keeps a filesystem root and trailing spaces instead of collapsing them to Home", () => {
		expect(resolveCapabilityProject("/", [], "/tmp/home").cwd).toBe("/");
		expect(resolveCapabilityProject("/", [], "/tmp/home").checkpointProjectKey).toBe(encodeProjectKey("/"));
		const spaced = "/tmp/has-trailing ";
		expect(resolveCapabilityProject(spaced, [], "/tmp/home").cwd).toBe(spaced);
		expect(resolveCapabilityProject(spaced, [], "/tmp/home").checkpointProjectKey).toBe(encodeProjectKey(spaced));
		expect(() => resolveCapabilityProject("relative/path", [], "/tmp/home")).toThrow(
			"Capability project cwd must be an absolute path.",
		);
	});

	it("lets Desktop config, including archived projects, resolve the same descriptor", async () => {
		const descriptor = await resolveDesktopCapabilityProject("c:/projects/archived", async () => [
			{ path: "C:\\Projects\\Archived" },
		]);
		expect(descriptor.cwd).toBe("C:\\Projects\\Archived");
		expect(descriptor.recordingProjectKey).toBe(sha256("C:\\Projects\\Archived").slice(0, 16));
	});
});

describe("evaluation scope lookup", () => {
	const projects = [{ path: "/games/demo" }, { path: "/games/other" }];
	const homeCwd = "/tmp/home";
	const demo = resolveCapabilityProject("/games/demo", projects, homeCwd);

	it("returns checkpoint and recording aliases for a known evaluation scope and fails closed otherwise", () => {
		const known = lookupCapabilityProjectByEvaluationScopeKey(
			`project:${demo.recordingProjectKey}`,
			projects,
			homeCwd,
		);
		expect(known?.descriptor).toEqual(demo);
		expect(known?.checkpointProjectKeys).toContain(demo.checkpointProjectKey);
		expect(known?.recordingProjectKeys).toEqual(
			expect.arrayContaining([demo.recordingProjectKey, sha256("/games/demo").slice(0, 24)]),
		);
		expect(lookupCapabilityProjectByEvaluationScopeKey("global", projects, homeCwd)?.descriptor.cwd).toBe(homeCwd);
		expect(
			lookupCapabilityProjectByEvaluationScopeKey("project:deadbeefdeadbeef", projects, homeCwd),
		).toBeUndefined();
		expect(lookupCapabilityProjectByEvaluationScopeKey("project:home", projects, homeCwd)).toBeUndefined();
		expect(lookupCapabilityProjectByEvaluationScopeKey("not-a-scope", projects, homeCwd)).toBeUndefined();
		expect(resolveCapabilityProjectKeysForEvaluationScope("global", projects, homeCwd)).toEqual({
			checkpointProjectKeys: [HOME_CHECKPOINT_PROJECT_KEY],
			recordingProjectKeys: ["home"],
		});
	});

	it("does not map another project or Home onto a known evaluation scope", () => {
		const other = resolveCapabilityProject("/games/other", projects, homeCwd);
		expect(
			lookupCapabilityProjectByEvaluationScopeKey(`project:${other.recordingProjectKey}`, projects, homeCwd)
				?.descriptor.cwd,
		).toBe("/games/other");
		expect(
			lookupCapabilityProjectByEvaluationScopeKey(`project:${demo.recordingProjectKey}`, projects, homeCwd)
				?.checkpointProjectKeys,
		).not.toContain(HOME_CHECKPOINT_PROJECT_KEY);
		expect(lookupCapabilityProjectByEvaluationScopeKey("global", projects, homeCwd)?.recordingProjectKeys).toEqual([
			"home",
		]);
	});

	it("reads Desktop projects when looking up a scope key", async () => {
		const readProjects = async () => [{ path: "/games/demo" }];
		await expect(
			resolveDesktopCapabilityProjectKeysForEvaluationScope(`project:${demo.recordingProjectKey}`, readProjects),
		).resolves.toEqual(
			expect.objectContaining({
				checkpointProjectKeys: expect.arrayContaining([demo.checkpointProjectKey]),
				recordingProjectKeys: expect.arrayContaining([demo.recordingProjectKey]),
			}),
		);
		await expect(
			resolveDesktopCapabilityProjectKeysForEvaluationScope("project:unknownunknown", readProjects),
		).resolves.toBeUndefined();
	});
});

describe("conversation Home default", () => {
	it("treats the Desktop conversation cwd as Home even when it is also listed as a project", () => {
		const descriptor = resolveCapabilityProject(DEFAULT_CONVERSATION_CWD, [{ path: DEFAULT_CONVERSATION_CWD }]);
		expect(descriptor.evaluationScope).toEqual({ kind: "global" });
		expect(descriptor.checkpointProjectKey).toBe(HOME_CHECKPOINT_PROJECT_KEY);
	});
});
