import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const localesRoot = join(dirname(fileURLToPath(import.meta.url)), "locales");

function loadNamespace(locale: "zh" | "en", fileName: string): unknown {
	return JSON.parse(readFileSync(join(localesRoot, locale, fileName), "utf8"));
}

function collectKeys(value: unknown, prefix = ""): string[] {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return prefix ? [prefix] : [];
	}
	return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) =>
		collectKeys(nested, prefix ? `${prefix}.${key}` : key),
	);
}

function collectStrings(value: unknown): string[] {
	if (typeof value === "string") return [value];
	if (value === null || typeof value !== "object") return [];
	if (Array.isArray(value)) return value.flatMap(collectStrings);
	return Object.values(value as Record<string, unknown>).flatMap(collectStrings);
}

describe("i18n catalog integrity", () => {
	const zhFiles = readdirSync(join(localesRoot, "zh"))
		.filter((name) => name.endsWith(".json"))
		.sort();
	const enFiles = readdirSync(join(localesRoot, "en"))
		.filter((name) => name.endsWith(".json"))
		.sort();

	it("keeps zh and en namespaces aligned", () => {
		expect(enFiles).toEqual(zhFiles);
		for (const fileName of zhFiles) {
			const zhKeys = collectKeys(loadNamespace("zh", fileName)).sort();
			const enKeys = collectKeys(loadNamespace("en", fileName)).sort();
			expect(enKeys, fileName).toEqual(zhKeys);
		}
	});

	it("uses Origin as the user-facing product name", () => {
		for (const locale of ["zh", "en"] as const) {
			for (const fileName of zhFiles) {
				const strings = collectStrings(loadNamespace(locale, fileName));
				for (const text of strings) {
					expect(text, `${locale}/${fileName}: ${text}`).not.toMatch(/\bVetta\b/);
					expect(text, `${locale}/${fileName}: ${text}`).not.toMatch(/OpenVetta/);
				}
			}
		}
		const appNameZh = (loadNamespace("zh", "common.json") as { appName: string }).appName;
		const appNameEn = (loadNamespace("en", "common.json") as { appName: string }).appName;
		expect(appNameZh).toBe("Origin");
		expect(appNameEn).toBe("Origin");
	});
});
