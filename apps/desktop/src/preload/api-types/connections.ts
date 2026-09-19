import type { ConnectionReadState, LiveQuota } from "@origin/coding-agent/connections";

export interface ConnectionUpsertDraft {
	readonly id?: string;
	readonly displayName: string;
	readonly protocol: string;
	readonly endpoint: string;
	readonly secret?: string;
	readonly credentialOrigin?: "signed-in" | "provided" | "env" | "command";
	readonly relayPrefixes?: readonly string[];
	readonly anchorModel?: string;
}

export interface DesktopConnectionsApi {
	list(): Promise<{ connections: ConnectionReadState[]; warning: { code: string; message: string } | null }>;
	upsert(draft: ConnectionUpsertDraft): Promise<ConnectionReadState>;
	remove(id: string): Promise<void>;
	quota(id: string): Promise<LiveQuota>;
}

export interface DesktopCloudApi {
	request<T = unknown>(
		path: string,
		options?: { method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown },
	): Promise<{
		ok: boolean;
		status: number;
		code: number;
		message: string;
		data?: T;
	}>;
}
