import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"@origin/agent-core": fileURLToPath(new URL("../agent/src/index.ts", import.meta.url)),
			"@origin/runtime-node/conversation/legacy": fileURLToPath(
				new URL("./src/conversation/legacy.ts", import.meta.url),
			),
			"@origin/runtime-node/credentials": fileURLToPath(
				new URL("./src/credentials/index.ts", import.meta.url),
			),
			"@origin/runtime-node/host": fileURLToPath(new URL("./src/host/index.ts", import.meta.url)),
			"@origin/runtime-node/sandbox": fileURLToPath(new URL("./src/sandbox/index.ts", import.meta.url)),
			"@origin/runtime-node/recording": fileURLToPath(new URL("./src/recording/index.ts", import.meta.url)),
			"@origin/runtime-node/coding": fileURLToPath(new URL("./src/coding/index.ts", import.meta.url)),
			"@origin/runtime-node/mcp": fileURLToPath(new URL("./src/mcp/index.ts", import.meta.url)),
			"@origin/runtime-node/conversation": fileURLToPath(
				new URL("./src/conversation/index.ts", import.meta.url),
			),
			"@origin/runtime-node": fileURLToPath(new URL("./src/index.ts", import.meta.url)),
			"@origin/runtime-mcp/auth": fileURLToPath(new URL("../runtime-mcp/src/auth/index.ts", import.meta.url)),
			"@origin/runtime-mcp/client": fileURLToPath(
				new URL("../runtime-mcp/src/client/index.ts", import.meta.url),
			),
			"@origin/runtime-mcp/config": fileURLToPath(
				new URL("../runtime-mcp/src/config/index.ts", import.meta.url),
			),
			"@origin/runtime-mcp/protocol": fileURLToPath(
				new URL("../runtime-mcp/src/protocol/index.ts", import.meta.url),
			),
			"@origin/runtime-mcp": fileURLToPath(new URL("../runtime-mcp/src/index.ts", import.meta.url)),
			"@origin/runtime-recording": fileURLToPath(new URL("../runtime-recording/src/index.ts", import.meta.url)),
			"@origin/runtime-storage/conversation": fileURLToPath(
				new URL("../runtime-storage/src/conversation/index.ts", import.meta.url),
			),
			"@origin/runtime-evolution": fileURLToPath(
				new URL("../runtime-evolution/src/index.ts", import.meta.url),
			),
			"@origin/runtime-storage": fileURLToPath(new URL("../runtime-storage/src/index.ts", import.meta.url)),
			"@origin/runtime-tools/coding": fileURLToPath(
				new URL("../runtime-tools/src/coding/index.ts", import.meta.url),
			),
			"@origin/runtime-tools": fileURLToPath(new URL("../runtime-tools/src/index.ts", import.meta.url)),
			"@origin/runtime-knowledge": fileURLToPath(
				new URL("../runtime-knowledge/src/index.ts", import.meta.url),
			),
			"@origin/runtime-evaluation": fileURLToPath(
				new URL("../runtime-evaluation/src/index.ts", import.meta.url),
			),
			"@origin/runtime-subagents": fileURLToPath(
				new URL("../runtime-subagents/src/index.ts", import.meta.url),
			),
			"@origin/runtime-core/configuration": fileURLToPath(
				new URL("../runtime-core/src/configuration/index.ts", import.meta.url),
			),
			"@origin/runtime-core/observation": fileURLToPath(
				new URL("../runtime-core/src/observation/index.ts", import.meta.url),
			),
			"@origin/runtime-core/conversation": fileURLToPath(
				new URL("../runtime-core/src/conversation/index.ts", import.meta.url),
			),
			"@origin/runtime-core/kernel": fileURLToPath(new URL("../runtime-core/src/kernel/index.ts", import.meta.url)),
			"@origin/runtime-core/sandbox": fileURLToPath(
				new URL("../runtime-core/src/sandbox/index.ts", import.meta.url),
			),
			"@origin/runtime-core": fileURLToPath(new URL("../runtime-core/src/index.ts", import.meta.url)),
			"@origin/runtime-checkpoints": fileURLToPath(new URL("../runtime-checkpoints/src/index.ts", import.meta.url)),
		},
	},
	test: {
		environment: "node",
	},
});
