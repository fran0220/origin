import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"@origin/agent-core": fileURLToPath(new URL("../agent/src/index.ts", import.meta.url)),
			"@origin/ai": fileURLToPath(new URL("../ai/src/index.ts", import.meta.url)),
			"@origin/runtime-core/conversation": fileURLToPath(
				new URL("./src/conversation/index.ts", import.meta.url),
			),
			"@origin/runtime-core/kernel": fileURLToPath(new URL("./src/kernel/index.ts", import.meta.url)),
			"@origin/runtime-core/sandbox": fileURLToPath(new URL("./src/sandbox/index.ts", import.meta.url)),
			"@origin/runtime-core": fileURLToPath(new URL("./src/index.ts", import.meta.url)),
		},
	},
	test: {
		globals: true,
		environment: "node",
	},
});
