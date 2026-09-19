import { join } from "node:path";
import { createCodingAgentCodingToolResultPolicy } from "@origin/coding-agent/composition";
import { createMcpToolResultPolicy, type McpToolResultPolicy } from "@origin/runtime-mcp";
import { createNodeResultArtifactStorage, type NodeSessionArtifactStore } from "@origin/runtime-node/host";
import type { CodingToolResultPolicy } from "@origin/runtime-tools";

export interface DesktopResultArtifactRuntime {
	readonly codingToolResultPolicy: CodingToolResultPolicy;
	readonly mcpToolResultPolicy: McpToolResultPolicy;
	readonly sessionArtifactCleaner: NodeSessionArtifactStore;
}

export function createDesktopResultArtifactRuntime(agentDir: string): DesktopResultArtifactRuntime {
	const storage = createNodeResultArtifactStorage({
		codingRoot: join(agentDir, "tool-results"),
		mcpRoot: join(agentDir, "mcp-results"),
	});
	return {
		codingToolResultPolicy: createCodingAgentCodingToolResultPolicy({ artifactStore: storage.coding }),
		mcpToolResultPolicy: createMcpToolResultPolicy({ artifactStore: storage.mcp }),
		sessionArtifactCleaner: storage.cleaner,
	};
}
