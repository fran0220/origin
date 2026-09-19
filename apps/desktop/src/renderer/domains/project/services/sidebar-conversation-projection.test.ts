import type { SessionInfo } from "@shared/store/atoms";
import { describe, expect, it } from "vitest";
import { projectSidebarConversations, sidebarConversationIdentity } from "./sidebar-conversation-projection";

const ordinary: SessionInfo = {
	id: "ordinary",
	path: "C:/sessions/ordinary.jsonl",
	cwd: "C:/project",
	firstMessage: "Ordinary",
	modifiedAt: 2,
};

describe("projectSidebarConversations", () => {
	it("projects ordinary conversations without mixing retired Team sessions", () => {
		const result = projectSidebarConversations([ordinary], { kind: "default" });

		expect(result.map((item) => item.kind)).toEqual(["conversation"]);
		expect(result[0]).toMatchObject({
			path: "C:/sessions/ordinary.jsonl",
			firstMessage: "Ordinary",
		});
	});

	it("presents the first-message label as a mutable conversation identity", () => {
		const identity = sidebarConversationIdentity(projectSidebarConversations([ordinary], { kind: "default" })[0]!, {
			conversationLabel: "Ordinary",
		});

		expect(identity).toEqual({
			key: "conversation:C:/sessions/ordinary.jsonl",
			label: "Ordinary",
			mutable: true,
		});
	});
});
