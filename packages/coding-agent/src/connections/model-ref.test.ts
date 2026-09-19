import { describe, expect, it } from "vitest";
import {
	formatConnectionModelRef,
	formatLegacyModelKey,
	parseBoundModelRef,
	parseModelRef,
	resolveStoredModelKey,
	toCanonicalModelKey,
	toLegacyModelKey,
} from "./model-ref.js";

describe("Connection model naming", () => {
	it("formats canonical connectionId:upstream and legacy provider/model", () => {
		const ref = { connectionId: "openai", upstreamModelId: "gpt-4o" };
		expect(formatConnectionModelRef(ref)).toBe("openai:gpt-4o");
		expect(formatLegacyModelKey(ref)).toBe("openai/gpt-4o");
	});

	it("parses both separators and prefers the first colon as the Connection boundary", () => {
		expect(parseBoundModelRef("openai:gpt-4o")).toEqual({ connectionId: "openai", upstreamModelId: "gpt-4o" });
		expect(parseBoundModelRef("openai/gpt-4o")).toEqual({ connectionId: "openai", upstreamModelId: "gpt-4o" });
		expect(parseBoundModelRef("origin:origin/fast")).toEqual({
			connectionId: "origin",
			upstreamModelId: "origin/fast",
		});
	});

	it("treats a bare id as an unbound upstream model", () => {
		expect(parseModelRef("gpt-4o")).toEqual({ upstreamModelId: "gpt-4o" });
	});

	it("maps stored legacy keys onto the current catalog without breaking existing sessions", () => {
		const catalog = ["openai:gpt-4o", "anthropic:claude-sonnet-4"];
		expect(resolveStoredModelKey("openai/gpt-4o", catalog)).toEqual({ ok: true, key: "openai:gpt-4o" });
		expect(resolveStoredModelKey("openai:gpt-4o", catalog)).toEqual({ ok: true, key: "openai:gpt-4o" });
		expect(toCanonicalModelKey("openai/gpt-4o")).toBe("openai:gpt-4o");
		expect(toLegacyModelKey("openai:gpt-4o")).toBe("openai/gpt-4o");
	});

	it("refuses an unbound upstream id that more than one Connection advertises", () => {
		const catalog = ["openai:gpt-4o", "azure:gpt-4o"];
		expect(resolveStoredModelKey("gpt-4o", catalog)).toEqual({ ok: false, reason: "ambiguous" });
	});

	it("resolves an unbound upstream id when exactly one Connection advertises it", () => {
		const catalog = ["openai:gpt-4o", "anthropic:claude-sonnet-4"];
		expect(resolveStoredModelKey("gpt-4o", catalog)).toEqual({ ok: true, key: "openai:gpt-4o" });
	});
});
