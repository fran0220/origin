import { type TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { TOOL_SCHEMAS, type ToolName } from "./schemas";

export interface ToolValidationError {
	ok: false;
	error: string;
	issues: string[];
}

export function validateToolInput(name: ToolName, input: unknown): ToolValidationError | null {
	return validateAgainst(TOOL_SCHEMAS[name], input, name);
}

export function validateAgainst(schema: TSchema, input: unknown, name: string): ToolValidationError | null {
	if (Value.Check(schema, input)) return null;
	const issues = [...Value.Errors(schema, input)].slice(0, 8).map((issue) => {
		const path = issue.path || "/";
		return `${path}: ${issue.message}`;
	});
	return {
		ok: false,
		error: `${name} input is invalid`,
		issues: issues.length > 0 ? issues : ["input does not match schema"],
	};
}
