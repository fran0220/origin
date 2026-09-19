import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"@origin-org/plugin-sdk": fileURLToPath(new URL("./test/helpers/plugin-sdk-stub.ts", import.meta.url)),
		},
	},
	test: {
		environment: "jsdom",
		include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
		testTimeout: 120_000,
	},
});
