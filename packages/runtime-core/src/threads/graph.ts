import type {
	RegisterThreadInput,
	ThreadCollaborationRecord,
	ThreadWaitAdmission,
	ThreadWaitRejection,
} from "./contracts.js";

/**
 * 产品无关的 Thread 协作图：血缘、回信预约、wait 互斥。
 * 不创建 Session、不投递消息、不读模型。
 */
export class ThreadCollaborationGraph {
	private readonly records = new Map<string, MutableThreadRecord>();

	register(input: RegisterThreadInput): ThreadCollaborationRecord {
		const existing = this.records.get(input.threadId);
		if (existing) {
			throw new Error(`Thread is already registered: ${input.threadId}`);
		}
		if (input.parentThreadId && input.parentThreadId === input.threadId) {
			throw new Error("A thread cannot be its own parent");
		}
		if (input.parentThreadId && !this.records.has(input.parentThreadId)) {
			throw new Error(`Unknown parent thread: ${input.parentThreadId}`);
		}
		const record: MutableThreadRecord = {
			threadId: input.threadId,
			parentThreadId: input.parentThreadId,
			origin: input.origin,
			intent: input.intent,
			dialMode: input.dialMode,
			createdAt: input.createdAt ?? 0,
			replyRequestedBy: new Set(),
		};
		this.records.set(input.threadId, record);
		return snapshot(record);
	}

	has(threadId: string): boolean {
		return this.records.has(threadId);
	}

	read(threadId: string): ThreadCollaborationRecord | undefined {
		const record = this.records.get(threadId);
		return record ? snapshot(record) : undefined;
	}

	require(threadId: string): ThreadCollaborationRecord {
		const record = this.read(threadId);
		if (!record) throw new Error(`Unknown thread: ${threadId}`);
		return record;
	}

	childrenOf(threadId: string): readonly ThreadCollaborationRecord[] {
		return [...this.records.values()].filter((record) => record.parentThreadId === threadId).map(snapshot);
	}

	/** 记录 `from` 已要求 `to` 完成后回信。此后 `from` 不得 wait `to`。 */
	requestReply(fromThreadId: string, toThreadId: string): ThreadCollaborationRecord {
		if (fromThreadId === toThreadId) {
			throw new Error("A thread cannot request a reply from itself");
		}
		const target = this.requireMutable(toThreadId);
		this.requireMutable(fromThreadId);
		target.replyRequestedBy.add(fromThreadId);
		return snapshot(target);
	}

	/** 目标把结果投递回请求方后清除预约，允许后续另一次 wait。 */
	clearReplyRequest(fromThreadId: string, toThreadId: string): void {
		this.records.get(toThreadId)?.replyRequestedBy.delete(fromThreadId);
	}

	admitWait(waiterThreadId: string, targets: readonly string[]): ThreadWaitAdmission | ThreadWaitRejection {
		this.requireMutable(waiterThreadId);
		const resolved = targets.length > 0 ? targets : this.childrenOf(waiterThreadId).map((child) => child.threadId);
		if (resolved.length === 0) {
			return {
				ok: false,
				reason: "unknown_target",
				threadId: waiterThreadId,
				detail: "No child threads to wait for",
			};
		}
		for (const targetId of resolved) {
			if (targetId === waiterThreadId) {
				return {
					ok: false,
					reason: "self_wait",
					threadId: targetId,
					detail: "A thread cannot wait for itself",
				};
			}
			const target = this.records.get(targetId);
			if (!target) {
				return {
					ok: false,
					reason: "unknown_target",
					threadId: targetId,
					detail: `Unknown thread: ${targetId}`,
				};
			}
			if (target.replyRequestedBy.has(waiterThreadId)) {
				return {
					ok: false,
					reason: "reply_pending",
					threadId: targetId,
					detail:
						"Already asked this thread to reply here. Do not wait; continue work and handle the inbound message.",
				};
			}
		}
		return { ok: true, targets: resolved };
	}

	remove(threadId: string): void {
		this.records.delete(threadId);
		for (const record of this.records.values()) {
			record.replyRequestedBy.delete(threadId);
		}
	}

	private requireMutable(threadId: string): MutableThreadRecord {
		const record = this.records.get(threadId);
		if (!record) throw new Error(`Unknown thread: ${threadId}`);
		return record;
	}
}

interface MutableThreadRecord {
	readonly threadId: string;
	readonly parentThreadId?: string;
	readonly origin: ThreadCollaborationRecord["origin"];
	readonly intent?: ThreadCollaborationRecord["intent"];
	readonly dialMode?: ThreadCollaborationRecord["dialMode"];
	readonly createdAt: number;
	readonly replyRequestedBy: Set<string>;
}

function snapshot(record: MutableThreadRecord): ThreadCollaborationRecord {
	return {
		threadId: record.threadId,
		parentThreadId: record.parentThreadId,
		origin: record.origin,
		intent: record.intent,
		dialMode: record.dialMode,
		createdAt: record.createdAt,
		replyRequestedBy: new Set(record.replyRequestedBy),
	};
}
