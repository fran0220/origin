import {
	type EvolutionLedger,
	type HarnessProjection,
	HISTORY_DEPTH,
	HOME_SUBJECT_ID,
	renderHarnessSupplement,
	subjectScope,
} from "@vetta/runtime-evolution";
import type { CodingAgentHarnessRuntime, CodingAgentHarnessRuntimeOptions } from "./contracts.js";
import { createHarnessToolRegistrations } from "./harness-tool-registration.js";

export class CodingAgentHarnessRuntimeImpl implements CodingAgentHarnessRuntime {
	readonly subject;
	readonly ledger;
	readonly toolRegistrations;
	private readonly now: () => number;
	private disposed = false;

	constructor(options: CodingAgentHarnessRuntimeOptions) {
		this.ledger = options.ledger;
		this.subject = subjectScope(options.subjectId.trim() || HOME_SUBJECT_ID);
		this.now = options.now ?? (() => Date.now());
		this.toolRegistrations = createHarnessToolRegistrations({
			ledger: this.ledger,
			subject: this.subject,
			now: this.now,
		});
	}

	async renderPromptHarness(): Promise<string> {
		this.assertOpen();
		const projection = await this.readProjection();
		return projection.rendered ?? "";
	}

	async readProjection(): Promise<HarnessProjection> {
		this.assertOpen();
		const global = await this.ledger.state({ kind: "global" });
		const subject = await this.ledger.state(this.subject);
		const [globalHistory, subjectHistory] = await Promise.all([
			this.ledger.history({ kind: "global" }, HISTORY_DEPTH),
			this.ledger.history(this.subject, HISTORY_DEPTH),
		]);
		const recentEvents = [...globalHistory, ...subjectHistory].sort((left, right) => right.revision - left.revision);
		return {
			global,
			subject,
			recentEvents,
			rendered: renderHarnessSupplement(global, subject, recentEvents),
		};
	}

	dispose(): void {
		this.disposed = true;
	}

	private assertOpen(): void {
		if (this.disposed) {
			throw new Error("Harness runtime has been disposed");
		}
	}
}

export function createCodingAgentHarnessRuntime(options: CodingAgentHarnessRuntimeOptions): CodingAgentHarnessRuntime {
	return new CodingAgentHarnessRuntimeImpl(options);
}

export function createCodingAgentHarnessRuntimeFromLedger(
	ledger: EvolutionLedger,
	subjectId: string,
	now?: () => number,
): CodingAgentHarnessRuntime {
	return createCodingAgentHarnessRuntime({ ledger, subjectId, now });
}
