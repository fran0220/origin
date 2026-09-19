import { describe, expect, it } from "vitest";
import { DEFAULT_CONVERSATION_CWD } from "../config/desktop-config-store.js";
import {
	checkpointCwdForProjectKey,
	checkpointProjectKeyForCwd,
	decodeProjectKey,
	encodeProjectKey,
	HOME_CHECKPOINT_PROJECT_KEY,
} from "./project-key.js";

describe("checkpoint project keys", () => {
	it("uses home for the default conversation cwd and encodes project paths", () => {
		expect(checkpointProjectKeyForCwd(undefined, [])).toBe(HOME_CHECKPOINT_PROJECT_KEY);
		expect(checkpointProjectKeyForCwd(DEFAULT_CONVERSATION_CWD, [])).toBe(HOME_CHECKPOINT_PROJECT_KEY);
		const key = checkpointProjectKeyForCwd("/tmp/demo", [{ path: "/tmp/demo" }]);
		expect(key).toBe(encodeProjectKey("/tmp/demo"));
		expect(decodeProjectKey(key)).toBe("/tmp/demo");
	});

	it("aligns Windows casing and separators to the registered project path", () => {
		const registered = "C:\\Projects\\Game";
		expect(checkpointProjectKeyForCwd("c:/projects/game/", [{ path: registered }])).toBe(
			encodeProjectKey(registered),
		);
	});

	it("rejects arbitrary strings that Node would still Buffer-decode", () => {
		expect(decodeProjectKey("not-a-path")).toBeUndefined();
		expect(decodeProjectKey("@@@@")).toBeUndefined();
		expect(decodeProjectKey("abc")).toBeUndefined();
		expect(decodeProjectKey(encodeProjectKey("relative/path"))).toBeUndefined();
		expect(decodeProjectKey(HOME_CHECKPOINT_PROJECT_KEY)).toBeUndefined();
	});

	it("refuses to restore an unreadable key into Home", () => {
		expect(checkpointCwdForProjectKey(HOME_CHECKPOINT_PROJECT_KEY, "/tmp/home")).toBe("/tmp/home");
		expect(() => checkpointCwdForProjectKey("not-a-path", "/tmp/home")).toThrow(
			"Cannot restore checkpoints for unreadable project key",
		);
		expect(() => checkpointCwdForProjectKey(encodeProjectKey("relative"), "/tmp/home")).toThrow(
			"Cannot restore checkpoints for unreadable project key",
		);
	});
});
