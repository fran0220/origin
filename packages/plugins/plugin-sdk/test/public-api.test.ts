import { describe, expect, expectTypeOf, it } from "vitest";
import type {
	PluginBrowserApi,
	PluginCodingAgentHookEventOf,
	PluginCodingAgentHookRegistration,
	PluginCodingAgentHookResult,
	PluginContext,
	PluginEvaluationApi,
	PluginEvaluationUpsertRequest,
	PluginProjectApi,
	PluginProjectIdentity,
	PluginRecordingApi,
} from "../src/index.js";
import { PLUGIN_CODING_AGENT_HOOK_EVENT_NAMES, PLUGIN_PERMISSIONS } from "../src/index.js";

describe("plugin-sdk public API", () => {
	it("exports the runtime permission catalog from the package root", () => {
		expect(PLUGIN_PERMISSIONS).toContain("network.fetch");
		expect(PLUGIN_PERMISSIONS).toContain("browser.read");
		expect(PLUGIN_PERMISSIONS).toContain("browser.open");
		expect(PLUGIN_PERMISSIONS).toContain("browser.interact");
		expect(PLUGIN_PERMISSIONS).toContain("shell.openExternal");
		expect(PLUGIN_PERMISSIONS).toContain("evaluation:run");
		expect(PLUGIN_PERMISSIONS).toContain("evaluation:read");
		expect(PLUGIN_PERMISSIONS).toContain("evaluation:write");
		expect(PLUGIN_PERMISSIONS).toContain("checkpoints:read");
		expect(PLUGIN_PERMISSIONS).toContain("checkpoints:revert");
		expect(PLUGIN_PERMISSIONS).toContain("recording:capture");
		expect(PLUGIN_PERMISSIONS).toContain("workspace.read");
	});

	it("exposes browser as a required facade with a display-only open method", () => {
		expectTypeOf<PluginContext["browser"]>().toEqualTypeOf<PluginBrowserApi>();
		expectTypeOf<PluginContext["browser"]["open"]>().toEqualTypeOf<(url: string) => void>();
	});

	it("exposes evaluation as a required facade with permissioned upsertDefinition", () => {
		expectTypeOf<PluginContext["evaluation"]>().toEqualTypeOf<PluginEvaluationApi>();
		expectTypeOf<PluginEvaluationApi["upsertDefinition"]>().parameter(0).toEqualTypeOf<PluginEvaluationUpsertRequest>();
		expectTypeOf<PluginEvaluationApi["run"]>().parameter(0).toHaveProperty("definitionId");
	});

	it("exposes project.resolve as a required facade gated by workspace.read", () => {
		expectTypeOf<PluginContext["project"]>().toEqualTypeOf<PluginProjectApi>();
		expectTypeOf<PluginProjectApi["resolve"]>().toEqualTypeOf<(cwd: string) => Promise<PluginProjectIdentity>>();
		expectTypeOf<PluginProjectIdentity>().toHaveProperty("evaluationScope");
		expectTypeOf<PluginProjectIdentity>().toHaveProperty("checkpointProjectKey");
		expectTypeOf<PluginProjectIdentity>().toHaveProperty("recordingProjectKey");
	});

	it("exposes recording as an optional facade gated by recording:capture", () => {
		expectTypeOf<PluginContext["recording"]>().toEqualTypeOf<PluginRecordingApi | undefined>();
	});

	it("exports the canonical Coding Agent Hook event catalog and event-specific types", () => {
		expect(PLUGIN_CODING_AGENT_HOOK_EVENT_NAMES).toHaveLength(12);
		expect(PLUGIN_CODING_AGENT_HOOK_EVENT_NAMES).toContain("PermissionRequest");
		expectTypeOf<PluginCodingAgentHookEventOf<"PreToolUse">["eventName"]>().toEqualTypeOf<"PreToolUse">();
		expectTypeOf<
			Extract<PluginCodingAgentHookResult<"Stop">, { action: "continue-agent" }>
		>().toEqualTypeOf<{
			action: "continue-agent";
			continuationFragments: readonly string[];
		}>();
		const registration = {
			id: "guard",
			eventName: "PreToolUse",
			scope_use: ["cli"],
			handler: ({ event }) => ({
				action: "continue",
				updatedToolInput: { observedTool: event.tool.hostName },
			}),
		} satisfies PluginCodingAgentHookRegistration<"PreToolUse">;
		expect(registration.eventName).toBe("PreToolUse");
	});
});
