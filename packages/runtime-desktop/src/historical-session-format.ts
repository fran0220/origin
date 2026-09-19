import {
	createCodingAgentHistoricalSessionCatalog,
	createCodingAgentHistoricalSessionFileHistoryReader,
} from "@origin/coding-agent/historical-sessions";
import type { RuntimeSessionCatalog, RuntimeSessionFileHistoryReader } from "@origin/runtime-core";
import { createDesktopHistoricalSessionHost } from "./historical-session-host.js";

export interface DesktopHistoricalSessionFormat {
	readonly sessionCatalog: RuntimeSessionCatalog;
	readonly sessionFileHistoryReader: RuntimeSessionFileHistoryReader;
}

/** 旧 JSONL 的发现、读取和文件生命周期兼容；不创建或持有 AgentSession。 */
export function createDesktopHistoricalSessionFormat(): DesktopHistoricalSessionFormat {
	const host = createDesktopHistoricalSessionHost();
	return {
		sessionCatalog: createCodingAgentHistoricalSessionCatalog(host),
		sessionFileHistoryReader: createCodingAgentHistoricalSessionFileHistoryReader(host),
	};
}
