import { getExportTemplateDir } from "@origin/coding-agent/config";
import { createCodingAgentHtmlExportRuntime } from "@origin/coding-agent/export-html";
import { parseCodingAgentHistoricalSessionDocument } from "@origin/coding-agent/historical-sessions";
import { createNodeHtmlExportFileAdapters, nodeSyncTextFileSource } from "@origin/runtime-node/host";

export function createCliCodingAgentHtmlExportRuntime() {
	return createCodingAgentHtmlExportRuntime(
		createNodeHtmlExportFileAdapters({
			templateDirectory: getExportTemplateDir(),
			readLegacySession: (path) => parseCodingAgentHistoricalSessionDocument(nodeSyncTextFileSource.read(path)),
		}),
	);
}
