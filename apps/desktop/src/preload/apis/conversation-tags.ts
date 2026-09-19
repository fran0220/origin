import type { IpcRenderer, IpcRendererEvent } from "electron";
import { CONVERSATION_TAGS_CHANGED_CHANNEL, type ConversationTagsSnapshot } from "../../shared/conversation-tags.js";
import type { DesktopApi } from "../api.js";

const CHANNELS = {
	LIST: "origin:conversation-tags:list",
	CREATE: "origin:conversation-tags:create",
	UPDATE: "origin:conversation-tags:update",
	DELETE: "origin:conversation-tags:delete",
	ASSIGN: "origin:conversation-tags:assign",
	FORGET: "origin:conversation-tags:forget",
} as const;

export function createConversationTagsApi(ipc: IpcRenderer): Pick<DesktopApi, "conversationTags"> {
	return {
		conversationTags: {
			list: () => ipc.invoke(CHANNELS.LIST),
			create: (input) => ipc.invoke(CHANNELS.CREATE, input),
			update: (input) => ipc.invoke(CHANNELS.UPDATE, input),
			remove: (tagId) => ipc.invoke(CHANNELS.DELETE, tagId),
			assign: (input) => ipc.invoke(CHANNELS.ASSIGN, input),
			forgetConversations: (sessionPaths) => ipc.invoke(CHANNELS.FORGET, [...sessionPaths]),
			onChanged: (listener) => {
				const handler = (_event: IpcRendererEvent, snapshot: ConversationTagsSnapshot): void => listener(snapshot);
				ipc.on(CONVERSATION_TAGS_CHANGED_CHANNEL, handler);
				return () => ipc.removeListener(CONVERSATION_TAGS_CHANGED_CHANNEL, handler);
			},
		},
	};
}
