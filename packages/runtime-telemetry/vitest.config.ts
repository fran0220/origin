import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({ resolve: { alias: {
	"@origin/runtime-core/observation": fileURLToPath(new URL("../runtime-core/src/observation/index.ts", import.meta.url)),
	"@origin/agent-core": fileURLToPath(new URL("../agent/src/index.ts", import.meta.url)),
} }, test: { environment: "node" } });
