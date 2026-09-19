import type { InstalledPlugin } from "@preload/api";
import { describe, expect, it } from "vitest";
import { createPluginPermissionApi } from "./plugin-permissions";

function pluginWith(permissions: InstalledPlugin["permissions"]): InstalledPlugin {
	return {
		id: "origin-game-studio",
		permissions,
		grantedPermissions: permissions,
	} as unknown as InstalledPlugin;
}

describe("plugin evaluation write and project resolve permission gates", () => {
	it("allows evaluation:write only when declared and granted", () => {
		const allowed = createPluginPermissionApi(pluginWith(["evaluation:write"]));
		expect(() => allowed.require("evaluation:write")).not.toThrow();
		const denied = createPluginPermissionApi(pluginWith(["evaluation:run", "evaluation:read"]));
		expect(() => denied.require("evaluation:write")).toThrow(/evaluation:write/);
	});

	it("allows project.resolve to reuse workspace.read", () => {
		const allowed = createPluginPermissionApi(pluginWith(["workspace.read"]));
		expect(() => allowed.require("workspace.read")).not.toThrow();
		const denied = createPluginPermissionApi(pluginWith(["evaluation:write"]));
		expect(() => denied.require("workspace.read")).toThrow(/workspace.read/);
	});
});
