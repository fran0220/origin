import { join } from "node:path";
import { getOriginHomePath } from "@origin/action-rpc";

export function getKnowledgeRoot(): string {
	return join(getOriginHomePath(), "knowledges");
}
