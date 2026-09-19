import {
	createKnowledgeProcessingSessionFactory,
	type KnowledgeProcessingSessionFactory,
} from "@origin/coding-agent/composition";
import { getAgentDir } from "@origin/coding-agent/config";
import type { CodingAgentModelRuntime } from "@origin/coding-agent/host-services";
import { detectWorkspaceFacts, probeWorkspaceSignals } from "@origin/coding-agent/model-context";
import {
	createDesktopCodingAgentSessionExecutionEnvironment,
	createDesktopCodingAgentToolEnvironment,
	createDesktopResultArtifactRuntime,
} from "@origin/runtime-desktop";
import { nodeModelInputImageProcessor, nodeWorkspaceFactsFileSource } from "@origin/runtime-node/coding";
import { createFileConversationPersistence } from "@origin/runtime-node/conversation";
import { createNodeKnowledgeRuntime } from "@origin/runtime-node/host";
import { getKnowledgeRoot } from "./knowledge-layout.js";

export interface DesktopKnowledgeProcessingSessionFactoryOptions {
	readonly getModelRegistry: () => CodingAgentModelRuntime;
}

/** Knowledge Processing 保留独立的场景装配边界，并复用宿主提供的模型与工具服务。 */
export function createDesktopKnowledgeProcessingSessionFactory(
	options: DesktopKnowledgeProcessingSessionFactoryOptions,
): KnowledgeProcessingSessionFactory {
	const resultArtifacts = createDesktopResultArtifactRuntime(getAgentDir());
	return createKnowledgeProcessingSessionFactory({
		getModelRegistry: options.getModelRegistry,
		createConversationPersistence: ({ conversationDir }) => createFileConversationPersistence(conversationDir),
		createToolEnvironment: createDesktopCodingAgentToolEnvironment,
		createSessionExecutionEnvironment: createDesktopCodingAgentSessionExecutionEnvironment,
		codingToolResultPolicy: resultArtifacts.codingToolResultPolicy,
		modelInputImageProcessor: nodeModelInputImageProcessor,
		knowledgeRuntime: createNodeKnowledgeRuntime(getKnowledgeRoot()),
		resolveWorkspaceFacts: (cwd) =>
			detectWorkspaceFacts(cwd, (root) => probeWorkspaceSignals(root, nodeWorkspaceFactsFileSource)),
	});
}
