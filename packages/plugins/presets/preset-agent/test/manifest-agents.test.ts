import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

interface Manifest {
	readonly id: string;
	readonly permissions?: string[];
	readonly agent?: {
		readonly agents?: {
			id: string;
			name: string;
			description?: string;
			avatar?: string;
			systemPromptPath?: string;
			legacyIds?: string[];
		}[];

	};
}

async function readManifest(): Promise<Manifest> {
	return JSON.parse(await readFile(resolve(import.meta.dirname, "../plugin.json"), "utf8")) as Manifest;
}

async function readLocale(locale: string): Promise<Record<string, string>> {
	return JSON.parse(await readFile(resolve(import.meta.dirname, `../locales/${locale}.json`), "utf8")) as Record<
		string,
		string
	>;
}

describe("Preset agent manifest", () => {
	it("contributes exactly the three host personas and asks for no permission", async () => {
		const manifest = await readManifest();
		expect(manifest.id).toBe("preset-agent");
		expect(manifest.agent?.agents?.map((agent) => agent.id)).toEqual([
			"master",
			"developer",
			"researcher",
			"auditor",
			"business",
		]);
		// 纯人设插件：拿到任何权限都说明有别的东西混了进来。
		expect(manifest.permissions).toBeUndefined();
	});

	it("ships a readable prompt and avatar for every agent", async () => {
		const manifest = await readManifest();
		for (const agent of manifest.agent?.agents ?? []) {
			expect(agent.systemPromptPath).toBeDefined();
			const prompt = await readFile(resolve(import.meta.dirname, "..", agent.systemPromptPath!), "utf8");
			expect(prompt.trim().length).toBeGreaterThan(0);
			expect(agent.avatar).toBeDefined();
			expect((await readFile(resolve(import.meta.dirname, "..", agent.avatar!))).byteLength).toBeGreaterThan(0);
		}
	});

	it("does not ship persistent teams; collaboration belongs to Threads", async () => {
		const manifest = await readManifest();
		expect(manifest.agent?.teams).toBeUndefined();
		const messages = await readLocale("en");
		expect(Object.keys(messages).filter((key) => key.startsWith("team."))).toEqual([]);
		for (const agent of manifest.agent?.agents ?? []) {
			const prompt = await readFile(resolve(import.meta.dirname, "..", agent.systemPromptPath!), "utf8");
			expect(prompt).not.toMatch(/team_delegate|team_wait|team_get_task|agent team/i);
		}
	});

	it("claims the ids the host used to ship, so existing profiles are upgraded in place", async () => {
		const manifest = await readManifest();
		const legacyIds = (manifest.agent?.agents ?? []).flatMap((agent) => agent.legacyIds ?? []);
		expect(legacyIds).toEqual(
			expect.arrayContaining(["master", "leader", "executor", "builder", "researcher", "auditor", "reviewer"]),
		);
		// 一个历史 id 只能由一个智能体接管，否则回填认领哪一份就成了顺序问题。
		expect(new Set(legacyIds).size).toBe(legacyIds.length);
	});

	it("resolves every %key% placeholder in both locales", async () => {
		const manifest = await readManifest();
		const placeholders = (manifest.agent?.agents ?? []).flatMap((agent) => [agent.name, agent.description ?? ""]);
		for (const locale of ["zh", "en"]) {
			const messages = await readLocale(locale);
			for (const raw of placeholders) {
				const key = /^%([^%]+)%$/.exec(raw)?.[1];
				expect(key, `${raw} must be a locale placeholder`).toBeDefined();
				expect(messages[key!], `${key} missing in ${locale}`).toBeTruthy();
			}
		}
	});
});
