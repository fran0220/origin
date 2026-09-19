/** 跨会话协作意图；决定默认 Dial、是否共享 cwd，以及是否要求回信。 */
export const THREAD_INTENTS = [
	"delegation",
	"parallel-work",
	"independent-review",
	"environment-access",
	"other",
] as const;
export type ThreadIntent = (typeof THREAD_INTENTS)[number];

/** Effort Dial。首条用户消息后冻结；换档必须开新 Thread。 */
export const DIAL_MODES = ["low", "medium", "high", "ultra"] as const;
export type DialMode = (typeof DIAL_MODES)[number];

/** wait_for_threads 视为 settled 的状态。idle 只表示当前没有在跑，不是成功。 */
export const THREAD_SETTLED_STATES = ["idle", "awaiting_approval", "error"] as const;
export type ThreadSettledState = (typeof THREAD_SETTLED_STATES)[number];

export const THREAD_LIVE_STATES = ["running", "queued"] as const;
export type ThreadLiveState = (typeof THREAD_LIVE_STATES)[number];

export type ThreadCollaborationState = ThreadSettledState | ThreadLiveState;

export type ThreadOrigin = "user" | "thread";

export interface ThreadCollaborationRecord {
	readonly threadId: string;
	readonly parentThreadId?: string;
	readonly origin: ThreadOrigin;
	readonly intent?: ThreadIntent;
	readonly dialMode?: DialMode;
	readonly createdAt: number;
	/** 要求本 Thread 结束后回信的父/兄弟 Thread。与 wait 互斥。 */
	readonly replyRequestedBy: ReadonlySet<string>;
}

export interface RegisterThreadInput {
	readonly threadId: string;
	readonly parentThreadId?: string;
	readonly origin: ThreadOrigin;
	readonly intent?: ThreadIntent;
	readonly dialMode?: DialMode;
	readonly createdAt?: number;
}

export type ThreadWaitRefusal = "unknown_target" | "reply_pending" | "self_wait";

export interface ThreadWaitAdmission {
	readonly ok: true;
	readonly targets: readonly string[];
}

export interface ThreadWaitRejection {
	readonly ok: false;
	readonly reason: ThreadWaitRefusal;
	readonly threadId: string;
	readonly detail: string;
}

export function isThreadIntent(value: string): value is ThreadIntent {
	return (THREAD_INTENTS as readonly string[]).includes(value);
}

export function isDialMode(value: string): value is DialMode {
	return (DIAL_MODES as readonly string[]).includes(value);
}

export function isThreadSettledState(value: string): value is ThreadSettledState {
	return (THREAD_SETTLED_STATES as readonly string[]).includes(value);
}
