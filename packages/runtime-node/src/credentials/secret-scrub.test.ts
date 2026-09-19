import { describe, expect, it } from "vitest";
import { scrubSecrets, scrubUnknown } from "./secret-scrub.js";

describe("secret scrub", () => {
	it("redacts Authorization, JWT, known key prefixes, and exact vault secrets", () => {
		const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0In0.abc";
		const text = `Authorization: Bearer ${jwt} sk-abcdefghijklmnopqrstuvwxyz query=?access_token=abc123`;
		const scrubbed = scrubSecrets(text, { knownSecrets: ["super-secret-value-xyz"] });
		expect(scrubbed).not.toContain(jwt);
		expect(scrubbed).not.toMatch(/sk-abcdefghijklmnopqrstuvwxyz/);
		expect(scrubbed).toContain("[redacted]");
		expect(scrubSecrets("keep super-secret-value-xyz out", { knownSecrets: ["super-secret-value-xyz"] })).toBe(
			"keep [redacted-secret] out",
		);
	});

	it("redacts secret-shaped object keys without walking into non-secret fields", () => {
		expect(
			scrubUnknown({
				apiKey: "sk-live-should-hide",
				model: "openai:gpt-4o",
				nested: { refreshToken: "refresh-me", note: "ok" },
			}),
		).toEqual({
			apiKey: "[redacted]",
			model: "openai:gpt-4o",
			nested: { refreshToken: "[redacted]", note: "ok" },
		});
	});
});
