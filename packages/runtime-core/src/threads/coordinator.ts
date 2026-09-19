import type { PromptRequest, RuntimeTurnPromptOutcome } from "../contracts.js";
import type { DialMode, ThreadIntent, ThreadOrigin } from "./contracts.js";
import type { ThreadCollaborationGraph } from "./graph.js";
import { formatInboundThreadMessage } from "./inbound-message.js";

export interface ThreadCreateRequest {
	readonly parentThreadId: string;
	readonly intent: ThreadIntent;
	readonly prompt: string;
	readonly dialMode?: DialMode;
	readonly cwd?: string;
	readonly wake?: boolean;
	readonly requestReply?: boolean;
}

export interface ThreadCreateResult {
	readonly threadId: string;
	readonly accepted: true;
}

export interface ThreadPostRequest {
	readonly fromThreadId: string;
	readonly toThreadId: string;
	readonly message: string;
	readonly wake?: boolean;
	readonly requestReply?: boolean;
}

export interface ThreadPostResult {
	readonly accepted: true;
	readonly queued: boolean;
	readonly toThreadId: string;
}

export interface ThreadWaitRequest {
	readonly waiterThreadId: string;
	readonly targets?: readonly string[];
	readonly timeoutMs?: number;
	readonly signal?: AbortSignal;
}

export interface ThreadWaitResult {
	readonly settled: readonly ThreadWaitSnapshot[];
	readonly timedOut: boolean;
}

export interface ThreadWaitSnapshot {
	readonly threadId: string;
	readonly running: boolean;
}

export interface RuntimeThreadTranscriptExcerpt {
	readonly role: string;
	readonly text: string;
}

export interface RuntimeThreadSessionPort {
	createSession(input: {
		readonly parentThreadId: string;
		readonly intent: ThreadIntent;
		readonly dialMode?: DialMode;
		readonly cwd?: string;
		readonly origin: ThreadOrigin;
	}): Promise<{ readonly threadId: string }>;
	prompt(threadId: string, request: PromptRequest): Promise<RuntimeTurnPromptOutcome>;
	queueIfRunning(threadId: string, request: PromptRequest): Promise<{ readonly queued: boolean }>;
	isRunning(threadId: string): boolean;
	readTranscript?(threadId: string): readonly RuntimeThreadTranscriptExcerpt[];
}

export interface RuntimeThreadCoordinatorOptions {
	readonly graph: ThreadCollaborationGraph;
	readonly sessions: RuntimeThreadSessionPort;
	readonly now?: () => number;
	readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

const DEFAULT_WAIT_TIMEOUT_MS = 30_000;
const WAIT_POLL_MS = 50;
const MIN_WAIT_MS = 1_000;
const MAX_WAIT_MS = 300_000;

/**
 * Thread 协作控制面：创建、投递、等待。图负责互斥；本对象负责 Session 副作用。
 */
export class RuntimeThreadCoordinator {
	private readonly now: () => number;
	private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;

	constructor(private readonly options: RuntimeThreadCoordinatorOptions) {
		this.now = options.now ?? Date.now;
		this.sleep = options.sleep ?? defaultSleep;
	}

	async createThread(request: ThreadCreateRequest): Promise<ThreadCreateResult> {
		this.options.graph.require(request.parentThreadId);
		const created = await this.options.sessions.createSession({
			parentThreadId: request.parentThreadId,
			intent: request.intent,
			dialMode: request.dialMode,
			cwd: request.cwd,
			origin: "thread",
		});
		if (!this.options.graph.has(created.threadId)) {
			this.options.graph.register({
				threadId: created.threadId,
				parentThreadId: request.parentThreadId,
				origin: "thread",
				intent: request.intent,
				dialMode: request.dialMode,
				createdAt: this.now(),
			});
		}
		if (request.requestReply !== false) {
			this.options.graph.requestReply(request.parentThreadId, created.threadId);
		}
		if (request.wake !== false && request.prompt.trim()) {
			// Amp 合同：create_thread 立即返回 id，不等子 Thread 推理结束。
			void this.options.sessions.prompt(created.threadId, { text: request.prompt });
		}
		return { threadId: created.threadId, accepted: true };
	}

	async postMessage(request: ThreadPostRequest): Promise<ThreadPostResult> {
		this.options.graph.require(request.fromThreadId);
		this.options.graph.require(request.toThreadId);
		if (request.requestReply) {
			this.options.graph.requestReply(request.fromThreadId, request.toThreadId);
		}
		const text = formatInboundThreadMessage(request.fromThreadId, request.message);
		const prompt: PromptRequest = { text };
		if (request.wake === false) {
			const queued = await this.options.sessions.queueIfRunning(request.toThreadId, {
				...prompt,
				streamingBehavior: "followUp",
			});
			if (!queued.queued && !this.options.sessions.isRunning(request.toThreadId)) {
				await this.options.sessions.prompt(request.toThreadId, prompt);
				return { accepted: true, queued: false, toThreadId: request.toThreadId };
			}
			return { accepted: true, queued: true, toThreadId: request.toThreadId };
		}
		if (this.options.sessions.isRunning(request.toThreadId)) {
			const queued = await this.options.sessions.queueIfRunning(request.toThreadId, {
				...prompt,
				streamingBehavior: "followUp",
			});
			return { accepted: true, queued: queued.queued, toThreadId: request.toThreadId };
		}
		await this.options.sessions.prompt(request.toThreadId, prompt);
		return { accepted: true, queued: false, toThreadId: request.toThreadId };
	}

	listChildren(threadId: string) {
		return this.options.graph.childrenOf(threadId);
	}

	readThread(threadId: string) {
		return this.options.graph.read(threadId);
	}

	readTranscript(threadId: string): readonly RuntimeThreadTranscriptExcerpt[] {
		this.options.graph.require(threadId);
		return this.options.sessions.readTranscript?.(threadId) ?? [];
	}

	async wait(request: ThreadWaitRequest): Promise<ThreadWaitResult> {
		const admission = this.options.graph.admitWait(request.waiterThreadId, request.targets ?? []);
		if (!admission.ok) {
			throw new Error(`${admission.reason}: ${admission.detail}`);
		}
		const timeoutMs = clamp(request.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS, MIN_WAIT_MS, MAX_WAIT_MS);
		const deadline = this.now() + timeoutMs;
		while (true) {
			request.signal?.throwIfAborted();
			const settled = admission.targets.map((threadId) => ({
				threadId,
				running: this.options.sessions.isRunning(threadId),
			}));
			if (settled.every((item) => !item.running)) {
				return { settled, timedOut: false };
			}
			if (this.now() >= deadline) {
				return { settled, timedOut: true };
			}
			await this.sleep(WAIT_POLL_MS, request.signal);
		}
	}
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			signal?.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		const onAbort = () => {
			clearTimeout(timer);
			reject(signal?.reason ?? new Error("Aborted"));
		};
		if (signal?.aborted) {
			clearTimeout(timer);
			reject(signal.reason ?? new Error("Aborted"));
			return;
		}
		signal?.addEventListener("abort", onAbort, { once: true });
	});
}
