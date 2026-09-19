import { describe, expect, it } from "vitest";
import { loadSettings, persistDefaultSettings, resolveConfiguredMcpUrl, resolveMcpUrl } from "../src/mcp/defaults";
import { updateProject } from "../src/store/project-store";
import {
	ToolError,
	executeCreateProject,
	executeDelivery,
	executePlayInputScript,
	executeRecording,
	executeUpdateAnnotation,
} from "../src/tools/runtime";
import { createToolContext } from "./helpers/memory-host";

describe("game studio tool error paths", () => {
	it("refuses create_project without a project cwd or a one-line idea", async () => {
		const { ctx } = createToolContext();
		await expect(executeCreateProject(ctx, { cwd: "", id: "s" }, { idea: "a maze" })).rejects.toThrow(ToolError);
		await expect(executeCreateProject(ctx, { cwd: "/tmp/game", id: "s" }, { idea: "   " })).rejects.toThrow(
			/one-line idea/,
		);
		await expect(executeCreateProject(ctx, { cwd: "/tmp/game", id: "s" }, { idea: "line\nbreak" })).rejects.toThrow(
			/one line/,
		);
	});

	it("refuses to dismiss an annotation without a reason and does not reopen settled ones", async () => {
		const { ctx } = createToolContext({ cwd: "/tmp/game" });
		await executeCreateProject(ctx, { cwd: "/tmp/game", id: "s" }, { idea: "a maze I can walk" });
		await updateProject(ctx.storage, "/tmp/game", (record) => {
			record.annotations.push({
				id: "a1",
				x: 0,
				y: 0,
				entity: null,
				source: null,
				state: "open",
				reason: null,
				beforeArtifact: null,
				afterArtifact: null,
				createdAt: 1,
			});
			return record;
		});

		await expect(
			executeUpdateAnnotation(ctx, { cwd: "/tmp/game", id: "s" }, { annotation_id: "a1", state: "dismissed" }),
		).rejects.toThrow(/reason/);

		await executeUpdateAnnotation(ctx, { cwd: "/tmp/game", id: "s" }, {
			annotation_id: "a1",
			state: "resolved",
			before_artifact: "before.png",
			after_artifact: "after.png",
		});
		await expect(
			executeUpdateAnnotation(ctx, { cwd: "/tmp/game", id: "s" }, { annotation_id: "a1", state: "acknowledged" }),
		).rejects.toThrow(/settled/);
	});

	it("refuses play_input_script paths outside playtests/", async () => {
		const { ctx } = createToolContext({ cwd: "/tmp/game" });
		await expect(executePlayInputScript(ctx, { cwd: "/tmp/game", id: "s" }, "../secret.json")).rejects.toThrow(
			/playtests/,
		);
		await expect(executePlayInputScript(ctx, { cwd: "/tmp/game", id: "s" }, "playtests/missing.json")).rejects.toThrow(
			/not there/,
		);
	});

	it("refuses publication and records a prepare receipt", async () => {
		const { ctx } = createToolContext({ cwd: "/tmp/game" });
		await executeCreateProject(ctx, { cwd: "/tmp/game", id: "s" }, { idea: "a maze I can walk" });
		await expect(
			executeDelivery(ctx, { cwd: "/tmp/game", id: "s" }, { action: "publish", archive_digest: "abc" }),
		).rejects.toThrow(/publication/);
		const prepared = (await executeDelivery(ctx, { cwd: "/tmp/game", id: "s" }, {
			action: "prepare",
			output_directory: "dist",
			source_revision: "sha256:abc",
		})) as { action: string; status: string };
		expect(prepared.action).toBe("prepare");
		expect(prepared.status).toBe("prepared");
	});

	it("lists host recordings and refuses missing recording ids instead of inventing clips", async () => {
		const { ctx } = createToolContext({ cwd: "/tmp/game" });
		await executeCreateProject(ctx, { cwd: "/tmp/game", id: "s" }, { idea: "a maze I can walk" });
		const listed = (await executeRecording(ctx, { cwd: "/tmp/game", id: "s" }, "list_recordings", {})) as {
			recordings: unknown[];
		};
		expect(listed.recordings).toEqual([]);
		await expect(
			executeRecording(ctx, { cwd: "/tmp/game", id: "s" }, "read_recording_video", { recording_id: "r1" }),
		).rejects.toThrow(/missing r1/);
	});
});

describe("configurable Origin MCP URLs", () => {
	it("keeps Sophon defaults and accepts storage overrides", async () => {
		expect(resolveMcpUrl("origin-examples")).toBe("https://registry.origingame.dev/mcp");
		const { storage } = createToolContext();
		const seeded = await persistDefaultSettings(storage);
		expect(seeded.mcpServers["origin-assets"]).toContain("api.origingame.dev");
		await storage.writeFile(
			"settings.json",
			JSON.stringify({
				mcpServers: { "origin-assets": "https://assets.example.test/mcp" },
			}),
			"utf8",
		);
		const loaded = await loadSettings(storage);
		expect(resolveConfiguredMcpUrl(loaded, "origin-assets")).toBe("https://assets.example.test/mcp");
		expect(resolveConfiguredMcpUrl(loaded, "origin-examples")).toBe("https://registry.origingame.dev/mcp");
	});
});
