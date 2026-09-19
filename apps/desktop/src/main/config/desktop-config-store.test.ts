import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { VETTA_HOME_ENV } from "@origin/action-rpc";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const temporaryRoots: string[] = [];
let previousHome: string | undefined;

/** desktop-config.json 的路径在模块加载时算好，所以每个用例重置模块并重设 VETTA_HOME。 */
async function loadStoreWithConfig(config: Record<string, unknown> | undefined): Promise<{
	readDesktopConfig: () => Promise<{ defaultAgentMode?: string }>;
}> {
	const home = await mkdtemp(join(tmpdir(), "vetta-config-"));
	temporaryRoots.push(home);
	process.env[VETTA_HOME_ENV] = home;
	if (config) {
		await writeFile(join(home, "desktop-config.json"), JSON.stringify(config), "utf8");
	}
	vi.resetModules();
	return await import("./desktop-config-store.js");
}

beforeEach(() => {
	previousHome = process.env[VETTA_HOME_ENV];
});

afterEach(async () => {
	if (previousHome === undefined) delete process.env[VETTA_HOME_ENV];
	else process.env[VETTA_HOME_ENV] = previousHome;
	await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("defaultAgentMode", () => {
	it("读取新字段", async () => {
		const store = await loadStoreWithConfig({ defaultAgentMode: "work" });
		expect((await store.readDesktopConfig()).defaultAgentMode).toBe("work");
	});

	it("旧 agentMode 字段不再被读取", async () => {
		const store = await loadStoreWithConfig({ agentMode: "work" });
		expect((await store.readDesktopConfig()).defaultAgentMode).toBe("coding");
	});

	it("字段缺失时回落 coding", async () => {
		const store = await loadStoreWithConfig({});
		expect((await store.readDesktopConfig()).defaultAgentMode).toBe("coding");
	});

	it("配置文件不存在时回落 coding", async () => {
		const store = await loadStoreWithConfig(undefined);
		expect((await store.readDesktopConfig()).defaultAgentMode).toBe("coding");
	});
});
