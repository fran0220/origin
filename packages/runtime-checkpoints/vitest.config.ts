import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"@origin/runtime-checkpoints": fileURLToPath(new URL("./src/index.ts", import.meta.url)),
		},
	},
	test: {
		environment: "node",
	},
});
