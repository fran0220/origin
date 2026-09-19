import type { CodingAgentBootstrap, CodingAgentExtensionCompatibilityAssessment } from "@origin/coding-agent/bootstrap";
import type {
	CodingAgentRuntimeComposition,
	CodingAgentRuntimeCompositionOptions,
} from "@origin/coding-agent/composition";
import type { CodingAgentHtmlExportRuntime } from "@origin/coding-agent/export-html";
import type { CodingAgentHistoricalSessionMigrationIncompatible } from "@origin/coding-agent/historical-sessions";
import type { RpcSessionCapabilities } from "@origin/coding-agent/rpc";
import type { RuntimeHostSession, RuntimeSessionCatalog } from "@origin/runtime-core";
import type { FileConversationOwnershipManagerOptions } from "@origin/runtime-node/conversation";
import type { CreateCliCodingAgentBootstrapOptions } from "../../coding-agent-bootstrap.js";
import type { CliPrintSessionAdapter } from "../../print-session-adapter.js";

export interface RpcRuntimeHostExtensionIncompatible {
	readonly kind: "extension-incompatible";
	readonly bootstrap: CodingAgentBootstrap;
	readonly sessionPath: string | undefined;
	readonly extensionCompatibility: CodingAgentExtensionCompatibilityAssessment;
}

export interface RpcRuntimeHostSessionIncompatible {
	readonly kind: "session-incompatible";
	readonly bootstrap: CodingAgentBootstrap;
	readonly sessionPath: string;
	readonly sessionCompatibility: CodingAgentHistoricalSessionMigrationIncompatible;
}

export interface RpcRuntimeHostReady {
	readonly kind: "rpc";
	readonly bootstrap: CodingAgentBootstrap;
	readonly session: RuntimeHostSession;
	readonly runtime: CodingAgentRuntimeComposition;
	readonly capabilities: RpcSessionCapabilities;
}

export type RpcRuntimeHostPreparation =
	| RpcRuntimeHostExtensionIncompatible
	| RpcRuntimeHostSessionIncompatible
	| RpcRuntimeHostReady;

export interface PrintRuntimeHostReady {
	readonly kind: "print";
	readonly bootstrap: CodingAgentBootstrap;
	readonly session: RuntimeHostSession;
	readonly runtime: CodingAgentRuntimeComposition;
	readonly printSession: CliPrintSessionAdapter;
}

export type PrintRuntimeHostPreparation =
	| RpcRuntimeHostExtensionIncompatible
	| RpcRuntimeHostSessionIncompatible
	| PrintRuntimeHostReady;

export interface PrepareRuntimeHostOptions {
	readonly bootstrap: CodingAgentBootstrap;
	readonly conversationDir: string;
	readonly sessionCatalog: RuntimeSessionCatalog;
	readonly htmlExporter?: CodingAgentHtmlExportRuntime;
	readonly createSessionId?: () => string;
	readonly ownership?: FileConversationOwnershipManagerOptions;
	readonly createPluginRuntime?: CodingAgentRuntimeCompositionOptions["createPluginRuntime"];
}

export interface CreateImRuntimeHostOptions
	extends Omit<PrepareRuntimeHostOptions, "bootstrap">,
		CreateCliCodingAgentBootstrapOptions {}
