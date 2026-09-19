import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	APP_LEGACY_PROTOCOL_SCHEME,
	APP_PRODUCT_NAME,
	APP_PROTOCOL_SCHEME,
	APP_PROTOCOL_SCHEMES,
	APP_RUNTIME_NAME,
	isAppProtocolUrl,
} from "./app-identity.js";

const packageRoot = join(import.meta.dirname, "..", "..");

function readPackageSource(relativePath: string): string {
	return readFileSync(join(packageRoot, relativePath), "utf8");
}

describe("app runtime name", () => {
	// 打包版的 app 名字来自 asar 内写入的 package.json，开发态由 main.ts 覆盖。
	// 两者一旦分叉，safeStorage 就会在开发与打包环境派生出不同的主密钥，
	// 共享 ~/.origin 时表现为“API key 丢失”，且互相覆盖对方的密文。
	it("matches the name written into the packaged app package.json", () => {
		const preparePack = readPackageSource("scripts/prepare-pack.js");
		expect(preparePack).toContain("name: APP_RUNTIME_NAME");
		expect(APP_RUNTIME_NAME).toBe("origin");
	});

	it("is applied to app.name unconditionally in the main process", () => {
		const mainSource = readPackageSource("src/main/main.ts");
		expect(mainSource).toContain("app.name = APP_RUNTIME_NAME;");
		// 早期实现只在开发态覆盖名字，正是环境间密钥分叉的成因。
		expect(mainSource).not.toMatch(/app\.name\s*=\s*"/);
	});
});

describe("product identity", () => {
	it("keeps the user-facing product name Origin while preserving the vetta runtime name", () => {
		expect(APP_PRODUCT_NAME).toBe("Origin");
		expect(APP_RUNTIME_NAME).toBe("origin");
	});

	it("registers origin as the current protocol and vetta as a compatibility listener", () => {
		expect(APP_PROTOCOL_SCHEME).toBe("origin");
		expect(APP_LEGACY_PROTOCOL_SCHEME).toBe("vetta");
		expect([...APP_PROTOCOL_SCHEMES]).toEqual(["origin", "vetta"]);
		expect(isAppProtocolUrl("origin://oauth/callback")).toBe(true);
		expect(isAppProtocolUrl("vetta://oauth/callback")).toBe(true);
		expect(isAppProtocolUrl("https://example.com")).toBe(false);
	});

	it("writes Origin productName and both protocol schemes into electron-builder config", () => {
		const preparePack = readPackageSource("scripts/prepare-pack.js");
		expect(preparePack).toContain("productName: PRODUCT_NAME");
		expect(preparePack).toContain("schemes: [...PROTOCOL_SCHEMES]");
		const identity = readPackageSource("scripts/product-identity.mjs");
		expect(identity).toContain('export const PRODUCT_NAME = "Origin"');
		expect(identity).toContain('export const APP_ID = "com.origin.desktop"');
		expect(identity).toContain('PROTOCOL_SCHEME = "origin"');
		expect(identity).toContain('LEGACY_PROTOCOL_SCHEME = "vetta"');
	});
});
