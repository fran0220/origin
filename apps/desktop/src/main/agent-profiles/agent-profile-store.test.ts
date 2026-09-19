import { type AgentProfileDocument, createAgentProfileFixture, INITIAL_AGENT_PROFILES } from "@origin/agent-profile";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentProfileConfigRepository } from "./agent-profile-config-repository.js";
import { AgentProfileStore, PROVIDED_RESOURCE_WRITE_ERROR } from "./agent-profile-store.js";
import { registerPresetPluginBlueprints } from "./preset-plugin-blueprints.testing.js";

vi.mock("../logger.js", () => ({
	getAppLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

class MemoryRepository implements AgentProfileConfigRepository {
	document: AgentProfileDocument = createAgentProfileFixture();
	writes = 0;
	failNextWrite = false;

	async read(): Promise<AgentProfileDocument> {
		return structuredClone(this.document);
	}

	async write(document: AgentProfileDocument): Promise<void> {
		this.writes += 1;
		if (this.failNextWrite) {
			this.failNextWrite = false;
			throw new Error("disk full");
		}
		await Promise.resolve();
		this.document = structuredClone(document);
	}
}

function createIdSequence(): () => string {
	let value = 0;
	return () => `id-${++value}`;
}

function agentInput(name: string) {
	return {
		name,
		mentionHandle: name.toLocaleLowerCase("en-US"),
		blueprintId: "builder",
		abilities: { selectionMode: "custom" as const, skills: [], mcpServers: [], plugins: [] },
	};
}

describe("AgentProfileStore plugin preset sync", () => {
	beforeEach(() => registerPresetPluginBlueprints());

	it("applies the plugin presets to the loaded configuration and tells subscribers", async () => {
		const repository = new MemoryRepository();
		const store = new AgentProfileStore({ repository, createId: createIdSequence(), now: () => 10 });
		const applied = vi.fn();
		store.onPluginPresetsApplied(applied);
		await store.read();

		await expect(store.syncPluginPresets()).resolves.toBe(true);

		expect(applied).toHaveBeenCalledTimes(1);
		const document = await store.read();
		expect(document.agents.some((agent) => agent.source?.pluginId === "preset-agent")).toBe(true);
		expect(applied.mock.calls[0]?.[0]).toBe(document);
		const writes = repository.writes;
		await expect(store.syncPluginPresets()).resolves.toBe(false);
		expect(repository.writes).toBe(writes);
		expect(applied).toHaveBeenCalledTimes(1);
	});
});

describe("AgentProfileStore transaction boundary", () => {
	beforeEach(() => registerPresetPluginBlueprints());

	it("serializes concurrent mutations without losing either profile", async () => {
		const repository = new MemoryRepository();
		const store = new AgentProfileStore({ repository, createId: createIdSequence(), now: () => 10 });

		await Promise.all([store.createAgent(agentInput("Alpha")), store.createAgent(agentInput("Beta"))]);

		expect(repository.document.revision).toBe(3);
		expect(repository.document.agents.slice(-2).map((agent) => agent.name)).toEqual(["Alpha", "Beta"]);
		expect(repository.writes).toBe(2);
	});

	it("does not publish a failed write and allows the next mutation to recover", async () => {
		const repository = new MemoryRepository();
		const store = new AgentProfileStore({ repository, createId: createIdSequence(), now: () => 10 });
		repository.failNextWrite = true;

		await expect(store.createAgent(agentInput("Failed"))).rejects.toThrow("disk full");
		await expect(store.createAgent(agentInput("Recovered"))).resolves.toMatchObject({ name: "Recovered" });

		const document = await store.read();
		expect(document.revision).toBe(2);
		expect(document.agents.at(-1)?.name).toBe("Recovered");
	});

	it("gives newly created agents all abilities unless a custom selection is provided", async () => {
		const repository = new MemoryRepository();
		const store = new AgentProfileStore({ repository, createId: createIdSequence(), now: () => 10 });

		const created = await store.createAgent({
			name: "Default",
			mentionHandle: "default",
			blueprintId: "builder",
		});

		expect(created.abilities.selectionMode).toBe("all");
	});

	it("allows customizing an initially supplied profile like any other profile", async () => {
		const repository = new MemoryRepository();
		const store = new AgentProfileStore({ repository, createId: createIdSequence(), now: () => 10 });
		const source = INITIAL_AGENT_PROFILES[0];
		if (!source) throw new Error("Expected an initial Agent profile");

		const updated = await store.updateAgent(source.id, {
			expectedRevision: source.revision,
			name: "Custom leader",
			description: "A customized role",
			mentionHandle: source.mentionHandle,
			abilities: source.abilities,
		});

		expect(updated).toMatchObject({
			id: source.id,
			name: "Custom leader",
			description: "A customized role",
		});
	});

	it("clears the system prompt override when the editor is left empty", async () => {
		const repository = new MemoryRepository();
		const store = new AgentProfileStore({ repository, createId: createIdSequence(), now: () => 10 });
		const created = await store.createAgent(agentInput("Prompted"));

		const overridden = await store.updateAgent(created.id, {
			expectedRevision: created.revision,
			name: created.name,
			description: created.description,
			systemPrompt: "  Speak plainly.  ",
			mentionHandle: created.mentionHandle,
			abilities: created.abilities,
		});
		expect(overridden.systemPrompt).toBe("Speak plainly.");

		const cleared = await store.updateAgent(overridden.id, {
			expectedRevision: overridden.revision,
			name: overridden.name,
			description: overridden.description,
			systemPrompt: "   ",
			mentionHandle: overridden.mentionHandle,
			abilities: overridden.abilities,
		});
		expect(cleared.systemPrompt).toBeUndefined();
	});

	it("allows deleting an initially supplied profile", async () => {
		const repository = new MemoryRepository();
		const store = new AgentProfileStore({ repository, createId: createIdSequence(), now: () => 10 });
		const source = INITIAL_AGENT_PROFILES[0];
		if (!source) throw new Error("Expected an initial Agent profile");

		await expect(
			store.deleteAgent(source.id, {
				expectedRevision: source.revision,
			}),
		).resolves.toBeUndefined();
		expect((await store.read()).agents.some((agent) => agent.id === source.id)).toBe(false);
	});

	it("refuses to edit an agent that a provider owns", async () => {
		const repository = new MemoryRepository();
		const store = new AgentProfileStore({ repository, createId: createIdSequence(), now: () => 10 });
		await store.syncPluginPresets();
		const provided = (await store.read()).agents.find((agent) => agent.source?.kind === "plugin");
		if (!provided) throw new Error("Expected a plugin-owned profile");

		await expect(
			store.updateAgent(provided.id, {
				expectedRevision: provided.revision,
				name: "Hijacked",
				description: provided.description,
				mentionHandle: provided.mentionHandle,
				abilities: provided.abilities,
			}),
		).rejects.toThrow(PROVIDED_RESOURCE_WRITE_ERROR);
	});

	it("refuses to delete an agent that a provider owns", async () => {
		const repository = new MemoryRepository();
		const store = new AgentProfileStore({ repository, createId: createIdSequence(), now: () => 10 });
		await store.syncPluginPresets();
		const provided = (await store.read()).agents.find((agent) => agent.source?.kind === "plugin");
		if (!provided) throw new Error("Expected a plugin-owned profile");

		await expect(
			store.deleteAgent(provided.id, {
				expectedRevision: provided.revision,
			}),
		).rejects.toThrow(PROVIDED_RESOURCE_WRITE_ERROR);
	});
});
