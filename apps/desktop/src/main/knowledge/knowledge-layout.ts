import { join } from "node:path";
import { getVettaHomePath } from "@origin/action-rpc";

export function getKnowledgeRoot(): string {
	return join(getVettaHomePath(), "knowledges");
}
