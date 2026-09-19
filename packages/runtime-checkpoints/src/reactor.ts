import { pendingEffects } from "./effects.js";
import { createCheckpointIdFactory, proposeOperationId } from "./ids.js";
import type {
	CheckpointClock,
	CheckpointEffect,
	CheckpointEngine,
	CheckpointIdFactory,
	CheckpointStore,
	VerificationRunner,
	WorkTreeVcs,
} from "./ports.js";
import {
	allVerificationsPassed,
	canRequestRevert,
	canRerunVerification,
	createProposedCheckpoint,
	decideAfterFailedVerification,
	interruptRunningVerification,
	markFailed,
	markLanded,
	markReverted,
	markReverting,
	markVerificationRunning,
	markVerificationSettled,
	resetVerificationForRerun,
} from "./state-machine.js";
import {
	type CheckpointPolicy,
	DEFAULT_CHECKPOINT_POLICY,
	MAX_CHECKPOINT_INTENT_BYTES,
	MAX_PROJECT_CHECKPOINTS,
	type MainlineCheckpoint,
	type ProposeCheckpointInput,
} from "./types.js";

export interface CheckpointReactorOptions {
	readonly store: CheckpointStore;
	readonly vcs: WorkTreeVcs;
	readonly runner: VerificationRunner;
	readonly cwdFor: (projectKey: string) => string | Promise<string>;
	readonly clock?: CheckpointClock;
	readonly ids?: CheckpointIdFactory;
	readonly retryIntervalMs?: number;
}

export class CheckpointReactor implements CheckpointEngine {
	private readonly store: CheckpointStore;
	private readonly vcs: WorkTreeVcs;
	private readonly runner: VerificationRunner;
	private readonly cwdFor: CheckpointReactorOptions["cwdFor"];
	private readonly clock: CheckpointClock;
	private readonly ids: CheckpointIdFactory;
	private readonly active = new Set<string>();
	private readonly queues = new Map<string, Promise<void>>();

	constructor(options: CheckpointReactorOptions) {
		this.store = options.store;
		this.vcs = options.vcs;
		this.runner = options.runner;
		this.cwdFor = options.cwdFor;
		this.clock = options.clock ?? { now: () => Date.now() };
		this.ids = options.ids ?? createCheckpointIdFactory(() => this.clock.now());
	}

	async propose(input: ProposeCheckpointInput): Promise<{ checkpoint: MainlineCheckpoint; created: boolean }> {
		assertIntent(input.intent);
		const operationId = proposeOperationId(input.sessionId, input.turnId);
		const existing = await this.store.getByOperationId(input.projectKey, operationId);
		if (existing) return { checkpoint: existing, created: false };
		const listed = await this.store.list(input.projectKey);
		if (listed.length >= MAX_PROJECT_CHECKPOINTS) {
			throw new Error(`Checkpoint timeline for ${input.projectKey} is full`);
		}
		const checkpoint = createProposedCheckpoint({
			id: this.ids.checkpointId(),
			operationId,
			createdAt: this.clock.now(),
			propose: input,
		});
		await this.store.append(checkpoint);
		await this.advance(input.projectKey);
		const latest = (await this.store.get(input.projectKey, checkpoint.id)) ?? checkpoint;
		return { checkpoint: latest, created: true };
	}

	async requestRevert(projectKey: string, checkpointId: string): Promise<MainlineCheckpoint> {
		const checkpoint = await this.requireCheckpoint(projectKey, checkpointId);
		if (!canRequestRevert(checkpoint)) {
			throw new Error(`Checkpoint ${checkpointId} cannot be reverted`);
		}
		const next = markReverting(checkpoint, this.ids.operationId(), this.clock.now());
		await this.store.replace(next);
		await this.advance(projectKey);
		return (await this.store.get(projectKey, checkpointId)) ?? next;
	}

	async rerunVerification(projectKey: string, checkpointId: string): Promise<MainlineCheckpoint> {
		const checkpoint = await this.requireCheckpoint(projectKey, checkpointId);
		if (!canRerunVerification(checkpoint)) {
			throw new Error(`Checkpoint ${checkpointId} cannot rerun verification`);
		}
		const next = resetVerificationForRerun(checkpoint, this.clock.now());
		await this.store.replace(next);
		await this.advance(projectKey);
		return (await this.store.get(projectKey, checkpointId)) ?? next;
	}

	async recover(projectKey: string): Promise<readonly MainlineCheckpoint[]> {
		const incomplete = await this.store.listIncomplete(projectKey);
		const recovered: MainlineCheckpoint[] = [];
		for (const checkpoint of incomplete) {
			let next = checkpoint;
			if (checkpoint.phase === "verifying") {
				for (const [index, step] of checkpoint.verification.entries()) {
					if (step.state.state !== "running") continue;
					const stored = await this.store.getReceipt(projectKey, step.state.executionId);
					if (stored) {
						next = markVerificationSettled(next, index, step.state.executionId, stored.outcome, this.clock.now());
						continue;
					}
					const inspected = await this.runner.inspect(step.state.executionId);
					if (inspected === "running") continue;
					if (inspected && inspected.executionId === step.state.executionId) {
						next = markVerificationSettled(
							next,
							index,
							step.state.executionId,
							inspected.outcome,
							this.clock.now(),
						);
					} else {
						next = interruptRunningVerification(next, this.clock.now());
					}
				}
			}
			if (next !== checkpoint) {
				await this.store.replace(next);
				recovered.push(next);
			} else {
				recovered.push(checkpoint);
			}
		}
		await this.advance(projectKey);
		return recovered;
	}

	async advance(projectKey: string): Promise<void> {
		const previous = this.queues.get(projectKey) ?? Promise.resolve();
		const run = previous.catch(() => undefined).then(() => this.drain(projectKey));
		this.queues.set(projectKey, run);
		await run;
	}

	async list(projectKey: string): Promise<readonly MainlineCheckpoint[]> {
		return this.store.list(projectKey);
	}

	async get(projectKey: string, checkpointId: string): Promise<MainlineCheckpoint | undefined> {
		return this.store.get(projectKey, checkpointId);
	}

	async readPolicy(projectKey: string): Promise<CheckpointPolicy> {
		return this.store.readPolicy(projectKey);
	}

	async setPolicy(policy: CheckpointPolicy): Promise<void> {
		await this.store.writePolicy(policy);
	}

	private async drain(projectKey: string): Promise<void> {
		for (;;) {
			const incomplete = await this.store.listIncomplete(projectKey);
			const policy = await this.store.readPolicy(projectKey);
			for (const checkpoint of incomplete) {
				const settled = settleIfVerificationComplete(checkpoint, policy, this.clock.now());
				if (settled !== checkpoint) await this.store.replace(settled);
			}
			const remaining = await this.store.listIncomplete(projectKey);
			const effects = remaining.flatMap((checkpoint) =>
				pendingEffects(checkpoint, (commandIndex) =>
					this.ids.executionId(projectKey, checkpoint.operationId, commandIndex),
				),
			);
			const next = effects.find((effect) => !this.active.has(effect.key));
			if (!next) return;
			this.active.add(next.key);
			try {
				await this.perform(next);
			} finally {
				this.active.delete(next.key);
			}
		}
	}

	private async perform(effect: CheckpointEffect): Promise<void> {
		const cwd = await this.cwdFor(effect.checkpoint.projectKey);
		const policy = await this.store.readPolicy(effect.checkpoint.projectKey);
		if (effect.kind === "verify") {
			await this.performVerify(effect, cwd);
			return;
		}
		if (effect.kind === "land") {
			await this.performLand(effect, cwd, policy);
			return;
		}
		await this.performRevert(effect, cwd, policy);
	}

	private async performVerify(effect: Extract<CheckpointEffect, { kind: "verify" }>, cwd: string): Promise<void> {
		let checkpoint = await this.requireCheckpoint(effect.checkpoint.projectKey, effect.checkpoint.id);
		if (effect.recordStart) {
			checkpoint = markVerificationRunning(checkpoint, effect.commandIndex, effect.executionId, this.clock.now());
			await this.store.replace(checkpoint);
		}
		const inspected = await this.runner.inspect(effect.executionId);
		const receipt =
			inspected && inspected !== "running"
				? inspected
				: await this.runner.run({
						executionId: effect.executionId,
						sessionId: checkpoint.sessionId,
						turnId: checkpoint.turnId,
						command: effect.step.command,
						cwd: effect.step.cwd || cwd,
					});
		await this.store.appendReceipt(checkpoint.projectKey, receipt);
		let settled = markVerificationSettled(
			checkpoint,
			effect.commandIndex,
			effect.executionId,
			receipt.outcome,
			this.clock.now(),
		);
		settled = settleIfVerificationComplete(
			settled,
			await this.store.readPolicy(checkpoint.projectKey),
			this.clock.now(),
		);
		await this.store.replace(settled);
	}

	private async performLand(
		effect: Extract<CheckpointEffect, { kind: "land" }>,
		cwd: string,
		policy: CheckpointPolicy,
	): Promise<void> {
		const checkpoint = await this.requireCheckpoint(effect.checkpoint.projectKey, effect.checkpoint.id);
		if (checkpoint.phase !== "verifying" || checkpoint.landed) return;
		try {
			const commit = await this.vcs.land({
				cwd,
				projectKey: checkpoint.projectKey,
				operationId: checkpoint.operationId,
				intent: checkpoint.intent,
				mode: policy.vcsMode ?? DEFAULT_CHECKPOINT_POLICY.vcsMode,
			});
			const landed = {
				...checkpoint,
				landed: commit,
				updatedAt: this.clock.now(),
			};
			const next = landed.verification.length === 0 ? markLanded(landed, commit, this.clock.now()) : landed;
			await this.store.replace(next);
		} catch (error) {
			await this.store.replace(markFailed(checkpoint, errorMessage(error), this.clock.now()));
		}
	}

	private async performRevert(
		effect: Extract<CheckpointEffect, { kind: "revert" }>,
		cwd: string,
		policy: CheckpointPolicy,
	): Promise<void> {
		const checkpoint = await this.requireCheckpoint(effect.checkpoint.projectKey, effect.checkpoint.id);
		if (checkpoint.phase !== "reverting" || !checkpoint.landed || !checkpoint.revertOperationId) return;
		try {
			const commit = await this.vcs.restore({
				cwd,
				projectKey: checkpoint.projectKey,
				operationId: checkpoint.revertOperationId,
				commit: checkpoint.landed.commit,
				mode: policy.vcsMode ?? DEFAULT_CHECKPOINT_POLICY.vcsMode,
			});
			await this.store.replace(markReverted(checkpoint, commit, this.clock.now()));
		} catch (error) {
			await this.store.replace(markFailed(checkpoint, errorMessage(error), this.clock.now()));
		}
	}

	private async requireCheckpoint(projectKey: string, checkpointId: string): Promise<MainlineCheckpoint> {
		const checkpoint = await this.store.get(projectKey, checkpointId);
		if (!checkpoint) throw new Error(`Checkpoint not found: ${checkpointId}`);
		return checkpoint;
	}
}

function settleIfVerificationComplete(
	checkpoint: MainlineCheckpoint,
	policy: CheckpointPolicy,
	updatedAt: number,
): MainlineCheckpoint {
	if (checkpoint.phase !== "verifying" || !checkpoint.landed) return checkpoint;
	if (checkpoint.verification.some((step) => step.state.state !== "settled")) return checkpoint;
	if (allVerificationsPassed(checkpoint)) {
		return markLanded(checkpoint, checkpoint.landed, updatedAt);
	}
	return decideAfterFailedVerification(checkpoint, policy.onVerificationFailure, updatedAt).checkpoint;
}

function utf8ByteLength(value: string): number {
	let bytes = 0;
	for (let index = 0; index < value.length; index += 1) {
		const code = value.charCodeAt(index);
		if (code <= 0x7f) bytes += 1;
		else if (code <= 0x7ff) bytes += 2;
		else if (code >= 0xd800 && code <= 0xdbff) {
			bytes += 4;
			index += 1;
		} else bytes += 3;
	}
	return bytes;
}

function assertIntent(intent: string): void {
	if (intent.trim().length === 0 || utf8ByteLength(intent) > MAX_CHECKPOINT_INTENT_BYTES) {
		throw new Error("Checkpoint intent must be bounded and non-blank");
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
