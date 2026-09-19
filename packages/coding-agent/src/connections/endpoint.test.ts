import { describe, expect, it } from "vitest";
import {
	InvalidConnectionEndpointError,
	parseConnectionEndpoint,
	stripEndpointToOrigin,
	tryParseConnectionEndpoint,
} from "./endpoint.js";

describe("ConnectionEndpoint", () => {
	it("accepts a credential-free HTTP origin", () => {
		expect(parseConnectionEndpoint("https://api.example.com")).toBe("https://api.example.com");
		expect(parseConnectionEndpoint("http://127.0.0.1:8787")).toBe("http://127.0.0.1:8787");
		expect(parseConnectionEndpoint("https://[2001:db8::1]:443")).toBe("https://[2001:db8::1]:443");
	});

	it("rejects URL userinfo as credential smuggling", () => {
		expect(tryParseConnectionEndpoint("https://user:pass@api.example.com")).toEqual({
			ok: false,
			code: "credential-smuggle",
		});
		expect(() => parseConnectionEndpoint("https://sk-secret@api.example.com")).toThrow(
			InvalidConnectionEndpointError,
		);
	});

	it("rejects path, query, and fragment that could carry a secret", () => {
		expect(tryParseConnectionEndpoint("https://api.example.com/v1")).toEqual({
			ok: false,
			code: "credential-smuggle",
		});
		expect(tryParseConnectionEndpoint("https://api.example.com?api_key=sk")).toEqual({
			ok: false,
			code: "credential-smuggle",
		});
		expect(tryParseConnectionEndpoint("https://api.example.com#token=abc")).toEqual({
			ok: false,
			code: "credential-smuggle",
		});
	});

	it("rejects whitespace, control characters, and missing scheme", () => {
		expect(tryParseConnectionEndpoint("https://api.example.com ")).toEqual({ ok: false, code: "whitespace" });
		expect(tryParseConnectionEndpoint("api.example.com")).toEqual({ ok: false, code: "missing-scheme" });
		expect(tryParseConnectionEndpoint("https://api.example.com\n")).toEqual({ ok: false, code: "whitespace" });
	});

	it("strips a provider base URL down to origin plus optional path prefix", () => {
		expect(stripEndpointToOrigin("https://api.openai.com/v1")).toEqual({
			origin: "https://api.openai.com",
			pathPrefix: "/v1",
		});
		expect(stripEndpointToOrigin("https://api.openai.com")).toEqual({
			origin: "https://api.openai.com",
			pathPrefix: undefined,
		});
	});
});
