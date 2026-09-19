import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgentProfileFixture } from "@origin/agent-team";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { agentBlueprintRegistry, resolveAgentBlueprint } from "./agent-blueprint-registry.js";
import { createAgentTeamFileRepository } from "./agent-team-file-repository.js";
import { createAgentTeamStorageKey, readAgentTeamStorageIndex } from "./agent-team-storage-layout.js";
import { registerPresetPluginBlueprints } from "./preset-plugin-blueprints.testing.js";

vi.mock("../logger.js", () => ({
	getAppLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const temporaryDirectories: string[] = [];

beforeEach(() => {
	agentBlueprintRegistry.replacePluginPresets([], [], { agentBlueprintIds: new Set() });
});

afterEach(async () => {
	for (const directory of temporaryDirectories.splice(0)) {
		await rm(directory, { recursive: true, force: true });
	}
});

async function createRepository(): Promise<{
	readonly repository: ReturnType<typeof createAgentTeamFileRepository>;
	readonly root: string;
}> {
	const root = await mkdtemp(join(tmpdir(), "vetta-agent-teams-"));
	temporaryDirectories.push(root);
	return { repository: createAgentTeamFileRepository({ root }), root };
}

function storedAgentRoot(root: string, agent: { readonly id: string; readonly name: string }): string {
	return join(root, "agents", createAgentTeamStorageKey(agent.name, agent.id));
}

describe("Agent Profile file repository", () => {
	it("writes metadata and long descriptions as separate files and reloads them", async () => {
		const { repository, root } = await createRepository();
		const document = createAgentProfileFixture();

		await repository.write(document);
		const loaded = await repository.read();

		expect(loaded.agents.map(({ systemPrompt: _prompt, ...agent }) => agent)).toEqual(
			expect.arrayContaining(document.agents.map(({ systemPrompt: _prompt, ...agent }) => agent)),
		);
		expect(loaded.agents).toHaveLength(document.agents.length);
		expect(loaded.revision).toBe(document.revision);
		const firstAgent = document.agents[0];
		if (!firstAgent) throw new Error("Expected an initial agent");
		const metadata = JSON.parse(
			await readFile(join(storedAgentRoot(root, firstAgent), "agent.json"), "utf8"),
		) as Record<string, unknown>;
		expect(metadata).not.toHaveProperty("description");
		expect(metadata).not.toHaveProperty("systemPrompt");
		expect(metadata).not.toHaveProperty("presetId");
		expect(await readFile(join(storedAgentRoot(root, firstAgent), "description.md"), "utf8")).toBe(
			document.agents[0]?.description,
		);
		expect(await readdir(storedAgentRoot(root, firstAgent))).not.toContain("system-prompt.md");
		const index = await readAgentTeamStorageIndex(root);
		expect(index.agents[firstAgent.id]).toBe(createAgentTeamStorageKey(firstAgent.name, firstAgent.id));
	});

	it("drops a stored prompt that merely repeats the blueprint default", async () => {
		const { repository, root } = await createRepository();
		const document = createAgentProfileFixture();
		const firstAgent = document.agents[0];
		if (!firstAgent) throw new Error("Expected an initial agent");
		registerPresetPluginBlueprints();
		const blueprint = resolveAgentBlueprint(firstAgent.blueprintId);
		if (!blueprint) throw new Error("Expected the profile blueprint");

		await repository.write(document);
		const agentRoot = storedAgentRoot(root, firstAgent);
		await writeFile(join(agentRoot, "system-prompt.md"), `${blueprint.systemPrompt}\n`, "utf8");

		const loaded = await repository.read();
		expect(loaded.agents.find((agent) => agent.id === firstAgent.id)?.systemPrompt).toBeUndefined();

		await repository.write(loaded);
		expect(await readdir(agentRoot)).not.toContain("system-prompt.md");
	});

	it("treats an emptied prompt file as no override", async () => {
		const { repository, root } = await createRepository();
		const document = createAgentProfileFixture();
		const firstAgent = document.agents[0];
		if (!firstAgent) throw new Error("Expected an initial agent");

		await repository.write(document);
		const agentRoot = storedAgentRoot(root, firstAgent);
		await writeFile(join(agentRoot, "system-prompt.md"), "   \n", "utf8");

		const loaded = await repository.read();
		expect(loaded.agents.find((agent) => agent.id === firstAgent.id)?.systemPrompt).toBeUndefined();
	});

	it("loads a user-edited system prompt from its content file", async () => {
		const { repository, root } = await createRepository();
		const document = createAgentProfileFixture();
		const firstAgent = document.agents[0];
		if (!firstAgent) throw new Error("Expected an initial agent");

		await repository.write(document);
		const promptPath = join(storedAgentRoot(root, firstAgent), "system-prompt.md");
		await writeFile(promptPath, "Custom long system prompt\n", "utf8");

		const loaded = await repository.read();
		expect(loaded.agents.find((agent) => agent.id === firstAgent.id)?.systemPrompt).toBe(
			"Custom long system prompt\n",
		);
	});

	it("skips an unreadable agent directory instead of reporting an empty library", async () => {
		const { repository, root } = await createRepository();
		const document = createAgentProfileFixture();
		await repository.write(document);
		await mkdir(join(root, "agents", "half-written"), { recursive: true });
		await writeFile(join(root, "agents", "half-written", "agent.json"), "{}", "utf8");

		const loaded = await repository.read();

		expect(loaded.agents).toHaveLength(document.agents.length);
	});

	it("keeps an unreadable agent directory when writing back", async () => {
		const { repository, root } = await createRepository();
		const document = createAgentProfileFixture();
		await repository.write(document);
		await mkdir(join(root, "agents", "half-written"), { recursive: true });
		await writeFile(join(root, "agents", "half-written", "agent.json"), "{}", "utf8");

		await repository.write(await repository.read());

		expect(await readdir(join(root, "agents"))).toContain("half-written");
	});

	it("drops a retired profile field instead of failing the whole configuration", async () => {
		const { repository, root } = await createRepository();
		const document = createAgentProfileFixture();
		await repository.write(document);
		const agent = document.agents[0];
		if (!agent) throw new Error("Expected an initial agent");
		const agentFile = join(storedAgentRoot(root, agent), "agent.json");
		const stored = JSON.parse(await readFile(agentFile, "utf8")) as Record<string, unknown>;
		await writeFile(agentFile, JSON.stringify({ ...stored, avatarBackground: "tint:coral" }), "utf8");

		const loaded = await repository.read();

		expect(loaded.agents).toHaveLength(document.agents.length);
		expect(loaded.agents[0]).not.toHaveProperty("avatarBackground");
	});

	it("preserves extension-owned directories beside profile resources", async () => {
		const { repository, root } = await createRepository();
		await mkdir(join(root, "assets"), { recursive: true });
		await writeFile(join(root, "assets", "README.md"), "owned by an extension", "utf8");

		await repository.write(createAgentProfileFixture());

		expect(await readFile(join(root, "assets", "README.md"), "utf8")).toBe("owned by an extension");
	});

	it("starts empty and lets providers lay down what the user sees first", async () => {
		const { repository } = await createRepository();

		const loaded = await repository.read();

		expect(loaded.agents).toEqual([]);
	});
});
