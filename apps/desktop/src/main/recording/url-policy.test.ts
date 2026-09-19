import { describe, expect, it } from "vitest";
import { resolveRecordingTargetUrl } from "./url-policy.js";

describe("resolveRecordingTargetUrl", () => {
	it("allows http(s) urls", () => {
		expect(resolveRecordingTargetUrl("https://example.com/play")).toBe("https://example.com/play");
	});

	it("allows file urls inside project cwd and rejects the rest", () => {
		const cwd = "/tmp/project";
		expect(resolveRecordingTargetUrl("file:///tmp/project/index.html", cwd)).toContain("index.html");
		expect(() => resolveRecordingTargetUrl("file:///etc/passwd", cwd)).toThrow(/inside the project cwd/);
		expect(() => resolveRecordingTargetUrl("ftp://example.com")).toThrow(/http\(s\)/);
	});
});
