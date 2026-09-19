import type { EvaluationClock } from "./ports.js";

export function createEvaluationClock(options?: {
	readonly now?: () => Date;
	readonly createId?: (prefix: string) => string;
}): EvaluationClock {
	return {
		now: options?.now ?? (() => new Date()),
		createId:
			options?.createId ??
			((prefix) => {
				const random = globalThis.crypto?.randomUUID?.();
				if (!random) throw new Error("Evaluation ids require crypto.randomUUID");
				return `${prefix}-${random}`;
			}),
	};
}
