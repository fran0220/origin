import { describe, expect, it } from "vitest";
import { DEFAULT_CONVERSATION_CWD } from "../config/desktop-config-store.js";
import {
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
});
