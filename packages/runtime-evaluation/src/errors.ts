export type EvaluationErrorCode =
	| "unavailable"
	| "invalid-definition"
	| "not-found"
	| "immutable"
	| "cancelled"
	| "store";

export class EvaluationError extends Error {
	readonly code: EvaluationErrorCode;

	constructor(code: EvaluationErrorCode, message: string) {
		super(message);
		this.name = "EvaluationError";
		this.code = code;
	}
}
