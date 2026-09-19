import { describe, expect, it } from "vitest";
import type { CatalogModel, DialRouteTable } from "./dial-routes.js";
import {
	AmbiguousDialRouteError,
	assertUnambiguousCatalog,
	resolveDialRoute,
	uniqueCatalogMatch,
} from "./dial-routes.js";

const catalog: CatalogModel[] = [
	{ key: "openai:gpt-4o", reasoningLevels: ["low", "medium", "high"] },
	{ key: "anthropic:claude-sonnet-4", reasoningLevels: ["high"] },
];

describe("DialRouteTable", () => {
	it("resolves an explicit fast slot to a Connection-qualified model", () => {
		const table: DialRouteTable = { fast: { modelKey: "openai/gpt-4o", reasoning: "high" } };
		expect(resolveDialRoute(table, "fast", catalog)).toEqual({
			ok: true,
			route: { kind: "fast", modelKey: "openai:gpt-4o", reasoning: "high" },
		});
	});

	it("resolves purpose routes independently of the global slots", () => {
		const table: DialRouteTable = {
			fast: { modelKey: "openai:gpt-4o" },
			purposes: { summary: { modelKey: "anthropic:claude-sonnet-4" } },
		};
		expect(resolveDialRoute(table, "summary", catalog)).toEqual({
			ok: true,
			route: { kind: "summary", modelKey: "anthropic:claude-sonnet-4" },
		});
	});

	it("refuses a same-named model advertised by more than one Connection", () => {
		const ambiguous: CatalogModel[] = [{ key: "openai:gpt-4o" }, { key: "azure:gpt-4o" }];
		expect(uniqueCatalogMatch("gpt-4o", ambiguous)).toEqual({
			ok: false,
			error: "ambiguous",
			detail: "gpt-4o is ambiguous across Connections",
		});
		expect(() => assertUnambiguousCatalog(ambiguous)).toThrow(AmbiguousDialRouteError);
	});

	it("does not silently pick a catalog leader when the stored slot is missing", () => {
		expect(resolveDialRoute({}, "deep", catalog)).toEqual({
			ok: false,
			error: "missing",
			detail: "deep has no route",
		});
	});

	it("does not store credentials on the route table", () => {
		const table: DialRouteTable = { fast: { modelKey: "openai:gpt-4o" } };
		expect(JSON.stringify(table)).not.toMatch(/sk-|apiKey|token/i);
	});
});
