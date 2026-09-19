import { describe, expect, it } from "vitest";
import { parseOriginNpmPluginPackage } from "../src/npm-package.js";

const validPackage = {
	name: "@example/origin-plugin-demo",
	version: "1.2.3",
	origin: {
		schemaVersion: 1,
		type: "desktop-plugin",
		pluginId: "demo",
		archive: "release/origin-plugin.zip",
	},
};

describe("parseOriginNpmPluginPackage", () => {
	it("parses a valid npm plugin distribution envelope", () => {
		expect(parseOriginNpmPluginPackage(validPackage)).toEqual(validPackage);
	});

	it("rejects archive paths that escape the npm package", () => {
		expect(() =>
			parseOriginNpmPluginPackage({
				...validPackage,
				origin: { ...validPackage.origin, archive: "../plugin.zip" },
			}),
		).toThrow("npm archive");
	});

	it("rejects unsupported metadata versions and extra fields", () => {
		expect(() =>
			parseOriginNpmPluginPackage({
				...validPackage,
				origin: { ...validPackage.origin, schemaVersion: 2 },
			}),
		).toThrow("schema version 1");
		expect(() =>
			parseOriginNpmPluginPackage({
				...validPackage,
				origin: { ...validPackage.origin, unexpected: true },
			}),
		).toThrow("schema version 1");
	});
});
