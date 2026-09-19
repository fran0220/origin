import { describe, expect, it } from "vitest";
import { createOriginPluginFederationConfig } from "../src/index.js";

function readShared(options: Parameters<typeof createOriginPluginFederationConfig>[0]) {
	const shared = createOriginPluginFederationConfig(options).shared;
	if (shared === undefined || Array.isArray(shared)) {
		throw new Error("Expected object-form Module Federation shared config");
	}
	return shared;
}

describe("createOriginPluginFederationConfig", () => {
	it("does not couple every plugin to the optional host Theme UI contract", () => {
		const shared = readShared({ name: "default_plugin" });

		expect(shared).not.toHaveProperty("@origin-org/theme-ui/plugin-ui");
	});

	it("does not share the optional host UI contract by default", () => {
		const shared = readShared({ name: "default_plugin" });

		expect(shared).not.toHaveProperty("@origin-org/ui");
		expect(shared).not.toHaveProperty("@origin/ui");
	});

	it("shares the current host UI package only when explicitly enabled", () => {
		const shared = readShared({ name: "host_ui_plugin", hostUi: true });

		expect(shared).toHaveProperty("@origin-org/ui", {
			singleton: true,
			import: false,
			requiredVersion: "*",
		});
		expect(shared).not.toHaveProperty("@origin/ui");
	});

	it("shares the host Theme UI contract only when explicitly enabled", () => {
		const shared = readShared({ name: "theme_ui_plugin", hostThemeUi: true });

		expect(shared).toHaveProperty("@origin-org/theme-ui/plugin-ui", {
			singleton: true,
			import: false,
			requiredVersion: "*",
		});
		expect(shared).not.toHaveProperty("@origin/theme-ui/plugin-ui");
	});
});
