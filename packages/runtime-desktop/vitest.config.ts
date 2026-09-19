import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: [
			{
				find: "@origin/runtime-core/configuration",
				replacement: fileURLToPath(new URL("../runtime-core/src/configuration/index.ts", import.meta.url)),
			},
			{
				find: "@origin/runtime-core/observation",
				replacement: fileURLToPath(new URL("../runtime-core/src/observation/index.ts", import.meta.url)),
			},
			{
				find: "@origin/runtime-node/conversation/legacy",
				replacement: fileURLToPath(new URL("../runtime-node/src/conversation/legacy.ts", import.meta.url)),
			},
			{
				find: "@origin/agent-core",
				replacement: fileURLToPath(new URL("../agent/src/index.ts", import.meta.url)),
			},
			{
				find: "@origin/ecosystem-adapter/hooks",
				replacement: fileURLToPath(new URL("../ecosystem-adapter/src/hooks/index.ts", import.meta.url)),
			},
			{
				find: "@origin/ecosystem-adapter",
				replacement: fileURLToPath(new URL("../ecosystem-adapter/src/index.ts", import.meta.url)),
			},
			{
				find: "@origin/coding-agent/bootstrap",
				replacement: fileURLToPath(new URL("../coding-agent/src/public-api/bootstrap.ts", import.meta.url)),
			},
			{
				find: "@origin/coding-agent/composition",
				replacement: fileURLToPath(new URL("../coding-agent/src/composition/index.ts", import.meta.url)),
			},
			{
				find: "@origin/coding-agent/model-context",
				replacement: fileURLToPath(new URL("../coding-agent/src/public-api/model-context.ts", import.meta.url)),
			},
			{
				find: "@origin/coding-agent/historical-sessions",
				replacement: fileURLToPath(
					new URL("../coding-agent/src/public-api/historical-sessions.ts", import.meta.url),
				),
			},
			{
				find: "@origin/coding-agent/hooks",
				replacement: fileURLToPath(new URL("../coding-agent/src/public-api/hooks.ts", import.meta.url)),
			},
			{
				find: "@origin/coding-agent/host-services",
				replacement: fileURLToPath(new URL("../coding-agent/src/public-api/host-services.ts", import.meta.url)),
			},
			{ find: "@origin/ai", replacement: fileURLToPath(new URL("../ai/src/index.ts", import.meta.url)) },
			{
				find: "@origin/runtime-core/kernel",
				replacement: fileURLToPath(new URL("../runtime-core/src/kernel/index.ts", import.meta.url)),
			},
			{
				find: "@origin/runtime-core/conversation",
				replacement: fileURLToPath(new URL("../runtime-core/src/conversation/index.ts", import.meta.url)),
			},
			{
				find: "@origin/runtime-core/sandbox",
				replacement: fileURLToPath(new URL("../runtime-core/src/sandbox/index.ts", import.meta.url)),
			},
			{
				find: "@origin/runtime-core/session-extensions",
				replacement: fileURLToPath(
					new URL("../runtime-core/src/session-extensions/index.ts", import.meta.url),
				),
			},
			{
				find: "@origin/runtime-core/failures",
				replacement: fileURLToPath(new URL("../runtime-core/src/failures.ts", import.meta.url)),
			},
			{
				find: "@origin/runtime-knowledge",
				replacement: fileURLToPath(new URL("../runtime-knowledge/src/index.ts", import.meta.url)),
			},
			{
				find: "@origin/runtime-subagents",
				replacement: fileURLToPath(new URL("../runtime-subagents/src/index.ts", import.meta.url)),
			},
			{
				find: "@origin/runtime-tools/coding",
				replacement: fileURLToPath(new URL("../runtime-tools/src/coding/index.ts", import.meta.url)),
			},
			{
				find: "@origin/runtime-tools",
				replacement: fileURLToPath(new URL("../runtime-tools/src/index.ts", import.meta.url)),
			},
			{
				find: "@origin/runtime-storage/conversation",
				replacement: fileURLToPath(new URL("../runtime-storage/src/conversation/index.ts", import.meta.url)),
			},
			{
				find: "@origin/runtime-node/conversation",
				replacement: fileURLToPath(new URL("../runtime-node/src/conversation/index.ts", import.meta.url)),
			},
			{
				find: "@origin/runtime-node/host",
				replacement: fileURLToPath(new URL("../runtime-node/src/host/index.ts", import.meta.url)),
			},
			{
				find: "@origin/runtime-node/sandbox",
				replacement: fileURLToPath(new URL("../runtime-node/src/sandbox/index.ts", import.meta.url)),
			},
			{
				find: "@origin/runtime-node/coding",
				replacement: fileURLToPath(new URL("../runtime-node/src/coding/index.ts", import.meta.url)),
			},
			{
				find: "@origin/runtime-node/mcp",
				replacement: fileURLToPath(new URL("../runtime-node/src/mcp/index.ts", import.meta.url)),
			},
			{
				find: "@origin/runtime-core",
				replacement: fileURLToPath(new URL("../runtime-core/src/index.ts", import.meta.url)),
			},
			{
				find: "@origin/runtime-mcp/auth",
				replacement: fileURLToPath(new URL("../runtime-mcp/src/auth/index.ts", import.meta.url)),
			},
			{
				find: "@origin/runtime-mcp/client",
				replacement: fileURLToPath(new URL("../runtime-mcp/src/client/index.ts", import.meta.url)),
			},
			{
				find: "@origin/runtime-mcp/config",
				replacement: fileURLToPath(new URL("../runtime-mcp/src/config/index.ts", import.meta.url)),
			},
			{
				find: "@origin/runtime-mcp/protocol",
				replacement: fileURLToPath(new URL("../runtime-mcp/src/protocol/index.ts", import.meta.url)),
			},
			{
				find: "@origin/runtime-mcp",
				replacement: fileURLToPath(new URL("../runtime-mcp/src/index.ts", import.meta.url)),
			},
		],
	},
	test: {
		environment: "node",
	},
});
