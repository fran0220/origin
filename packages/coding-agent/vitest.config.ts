import { fileURLToPath } from "node:url";
import { coverageConfigDefaults, defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"@origin/coding-agent/resources": fileURLToPath(
				new URL("./src/public-api/resources.ts", import.meta.url),
			),
			"@origin/agent-core": fileURLToPath(new URL("../agent/src/index.ts", import.meta.url)),
			"@origin/ai": fileURLToPath(new URL("../ai/src/index.ts", import.meta.url)),
			"@origin/ecosystem-adapter/hooks": fileURLToPath(
				new URL("../ecosystem-adapter/src/hooks/index.ts", import.meta.url),
			),
			"@origin/ecosystem-adapter": fileURLToPath(new URL("../ecosystem-adapter/src/index.ts", import.meta.url)),
			"@origin/runtime-evaluation": fileURLToPath(new URL("../runtime-evaluation/src/index.ts", import.meta.url)),
			"@origin/runtime-knowledge": fileURLToPath(new URL("../runtime-knowledge/src/index.ts", import.meta.url)),
			"@origin/runtime-subagents": fileURLToPath(new URL("../runtime-subagents/src/index.ts", import.meta.url)),
			"@origin/runtime-evolution": fileURLToPath(new URL("../runtime-evolution/src/index.ts", import.meta.url)),
			"@origin/runtime-storage/conversation": fileURLToPath(
				new URL("../runtime-storage/src/conversation/index.ts", import.meta.url),
			),
			"@origin/coding-agent/connections": fileURLToPath(
				new URL("./src/public-api/connections.ts", import.meta.url),
			),
			"@origin/runtime-recording": fileURLToPath(new URL("../runtime-recording/src/index.ts", import.meta.url)),
			"@origin/runtime-node/evolution": fileURLToPath(
				new URL("../runtime-node/src/evolution/index.ts", import.meta.url),
			),
			"@origin/runtime-node/recording": fileURLToPath(
				new URL("../runtime-node/src/recording/index.ts", import.meta.url),
			),
			"@origin/runtime-node/sandbox": fileURLToPath(
				new URL("../runtime-node/src/sandbox/index.ts", import.meta.url),
			),
			"@origin/runtime-node/conversation/legacy": fileURLToPath(
				new URL("../runtime-node/src/conversation/legacy.ts", import.meta.url),
			),
			"@origin/runtime-node/conversation": fileURLToPath(
				new URL("../runtime-node/src/conversation/index.ts", import.meta.url),
			),
			"@origin/runtime-node/coding": fileURLToPath(
				new URL("../runtime-node/src/coding/index.ts", import.meta.url),
			),
			"@origin/runtime-node/host": fileURLToPath(new URL("../runtime-node/src/host/index.ts", import.meta.url)),
			"@origin/runtime-node/mcp": fileURLToPath(new URL("../runtime-node/src/mcp/index.ts", import.meta.url)),
			"@origin/runtime-tools/coding": fileURLToPath(
				new URL("../runtime-tools/src/coding/index.ts", import.meta.url),
			),
			"@origin/runtime-tools": fileURLToPath(new URL("../runtime-tools/src/index.ts", import.meta.url)),
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
			"@origin/runtime-core/configuration": fileURLToPath(
				new URL("../runtime-core/src/configuration/index.ts", import.meta.url),
			),
			"@origin/runtime-core/observation": fileURLToPath(
				new URL("../runtime-core/src/observation/index.ts", import.meta.url),
			),
			"@origin/runtime-core/kernel": fileURLToPath(
				new URL("../runtime-core/src/kernel/index.ts", import.meta.url),
			),
			"@origin/runtime-core/conversation": fileURLToPath(
				new URL("../runtime-core/src/conversation/index.ts", import.meta.url),
			),
			"@origin/runtime-core/failures": fileURLToPath(new URL("../runtime-core/src/failures.ts", import.meta.url)),
			"@origin/runtime-core/sandbox": fileURLToPath(
				new URL("../runtime-core/src/sandbox/index.ts", import.meta.url),
			),
			"@origin/runtime-core/session-extensions": fileURLToPath(
				new URL("../runtime-core/src/session-extensions/index.ts", import.meta.url),
			),
			"@origin/runtime-core": fileURLToPath(new URL("../runtime-core/src/index.ts", import.meta.url)),
			"@origin/runtime-checkpoints": fileURLToPath(new URL("../runtime-checkpoints/src/index.ts", import.meta.url)),
		},
	},
	test: {
		globals: true,
		environment: "node",
		testTimeout: 30000, // 30 seconds for API calls
		server: {
			deps: {
				external: [/@silvia-odwyer\/photon-node/],
			},
		},
		// Opt-in via `bun run test:coverage` only; default `test` is unchanged.
		coverage: {
			provider: "v8",
			reporter: ["text", "html", "lcov"],
			reportsDirectory: "./coverage",
			// Known baseline failures must not hide the coverage map.
			reportOnFailure: true,
			// Honest denominator: package source. Untested files stay at 0% (Vitest 3 all:true).
			include: ["src/**/*.{ts,tsx}"],
			exclude: [
				...coverageConfigDefaults.exclude,
				// Third-party / static assets shipped with the package, not unit-test targets.
				"src/export-html/assets/vendor/**",
			],
		},
	},
});
