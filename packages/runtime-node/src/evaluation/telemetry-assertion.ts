import type { RecordingTelemetryLine } from "@vetta/runtime-recording";
import { parseRecordingJsonlText, parseRecordingTelemetryLine } from "@vetta/runtime-recording";

export type TelemetryAssertionState = "passed" | "failed" | "inconclusive" | "error";

export interface TelemetryAssertionResult {
	readonly state: TelemetryAssertionState;
	readonly note?: string;
}

const MAX_EXPRESSION_BYTES = 4_096;
const MAX_DEPTH = 8;
const MAX_BRANCH = 16;
const MAX_PATH_SEGMENTS = 8;
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const FORBIDDEN_SEGMENTS = new Set(["__proto__", "constructor", "prototype"]);
const COMPARE_OPS = new Set(["eq", "ne", "gt", "gte", "lt", "lte"]);

type CompareOp = "eq" | "ne" | "gt" | "gte" | "lt" | "lte";

type AssertionExpr =
	| { readonly kind: "all"; readonly items: readonly AssertionExpr[] }
	| { readonly kind: "any"; readonly items: readonly AssertionExpr[] }
	| { readonly kind: "not"; readonly item: AssertionExpr }
	| {
			readonly kind: "compare";
			readonly path: string;
			readonly op: CompareOp;
			readonly rhs:
				| { readonly type: "value"; readonly value: Scalar }
				| { readonly type: "path"; readonly path: string };
	  };

type Scalar = number | boolean | string | null;

export interface RecordingTelemetryProjection {
	readonly playback?: { readonly dispatched: number; readonly refused: number };
	readonly beforeTick?: number;
	readonly afterTick?: number;
}

interface ParseFailure {
	readonly error: string;
}

type InternalEval =
	| { readonly state: "passed" }
	| { readonly state: "failed"; readonly note: string }
	| { readonly state: "inconclusive"; readonly note: string }
	| { readonly state: "error"; readonly note: string };

export function evaluateTelemetryAssertion(telemetryText: string, expression: string): TelemetryAssertionResult {
	const parsed = parseTelemetryAssertionExpression(expression);
	if ("error" in parsed) {
		return { state: "error", note: parsed.error };
	}
	let lines: RecordingTelemetryLine[];
	try {
		lines = parseRecordingTelemetryJsonl(telemetryText);
	} catch (error) {
		return {
			state: "error",
			note: error instanceof Error ? error.message : String(error),
		};
	}
	if (lines.length === 0) {
		return { state: "inconclusive", note: "Recording telemetry is empty." };
	}
	return evaluateParsedTelemetryAssertion(parsed, projectRecordingTelemetry(lines));
}

export function parseTelemetryAssertionExpression(expression: string): AssertionExpr | ParseFailure {
	if (Buffer.byteLength(expression, "utf8") > MAX_EXPRESSION_BYTES) {
		return { error: "telemetry assertion expression exceeds 4KB" };
	}
	const trimmed = expression.trim();
	if (trimmed.length === 0) {
		return { error: "telemetry assertion expression is empty" };
	}
	let json: unknown;
	try {
		json = JSON.parse(trimmed) as unknown;
	} catch {
		return { error: "telemetry assertion expression is not valid JSON" };
	}
	return parseExpr(json, 0);
}

export function parseRecordingTelemetryJsonl(text: string): RecordingTelemetryLine[] {
	return parseRecordingJsonlText(text, parseRecordingTelemetryLine);
}

export function projectRecordingTelemetry(lines: readonly RecordingTelemetryLine[]): RecordingTelemetryProjection {
	let dispatched = 0;
	let refused = 0;
	let inputSamples = 0;
	const ticks: number[] = [];
	for (const line of lines) {
		if (line.kind === "input") {
			const accepted = booleanInputResult(line.payload);
			if (accepted === undefined) continue;
			inputSamples += 1;
			if (accepted) dispatched += 1;
			else refused += 1;
			continue;
		}
		if (line.kind === "tick" || line.kind === "advance") {
			const tick = numericProbeResult(line.payload);
			if (tick !== undefined) ticks.push(tick);
		}
	}
	const projection: {
		playback?: { dispatched: number; refused: number };
		beforeTick?: number;
		afterTick?: number;
	} = {};
	if (inputSamples > 0) {
		projection.playback = { dispatched, refused };
	}
	if (ticks.length >= 2) {
		projection.beforeTick = ticks[0];
		projection.afterTick = ticks[ticks.length - 1];
	}
	return projection;
}

function evaluateParsedTelemetryAssertion(
	expr: AssertionExpr,
	projection: RecordingTelemetryProjection,
): TelemetryAssertionResult {
	return evalExpr(expr, projection as unknown as Record<string, unknown>);
}

function parseExpr(value: unknown, depth: number): AssertionExpr | ParseFailure {
	if (depth > MAX_DEPTH) {
		return { error: "telemetry assertion expression exceeds maximum depth" };
	}
	if (!isPlainObject(value)) {
		return { error: "telemetry assertion expression must be a JSON object" };
	}
	const keys = Object.keys(value);
	if (keys.length === 1 && keys[0] === "all") {
		return parseList("all", value.all, depth);
	}
	if (keys.length === 1 && keys[0] === "any") {
		return parseList("any", value.any, depth);
	}
	if (keys.length === 1 && keys[0] === "not") {
		const inner = parseExpr(value.not, depth + 1);
		if ("error" in inner) return inner;
		return { kind: "not", item: inner };
	}
	if (keys.includes("path") && keys.includes("op")) {
		return parseCompare(value, keys);
	}
	return { error: "telemetry assertion expression has unknown keys" };
}

function parseList(kind: "all" | "any", value: unknown, depth: number): AssertionExpr | ParseFailure {
	if (!Array.isArray(value)) {
		return { error: `telemetry assertion "${kind}" must be an array` };
	}
	if (value.length === 0 || value.length > MAX_BRANCH) {
		return { error: `telemetry assertion "${kind}" must contain 1–${MAX_BRANCH} clauses` };
	}
	const items: AssertionExpr[] = [];
	for (const entry of value) {
		const parsed = parseExpr(entry, depth + 1);
		if ("error" in parsed) return parsed;
		items.push(parsed);
	}
	return { kind, items };
}

function parseCompare(value: Record<string, unknown>, keys: readonly string[]): AssertionExpr | ParseFailure {
	const allowed = new Set(["path", "op", "value", "other"]);
	if (keys.some((key) => !allowed.has(key))) {
		return { error: "telemetry assertion comparison has unknown keys" };
	}
	const hasValue = keys.includes("value");
	const hasOther = keys.includes("other");
	if (hasValue === hasOther) {
		return { error: "telemetry assertion comparison requires exactly one of value or other" };
	}
	if (typeof value.path !== "string") {
		return { error: "telemetry assertion path must be a dotted identifier" };
	}
	const pathError = validatePath(value.path);
	if (pathError) return { error: pathError };
	if (typeof value.op !== "string" || !COMPARE_OPS.has(value.op)) {
		return { error: "telemetry assertion op must be eq, ne, gt, gte, lt, or lte" };
	}
	const op = value.op as CompareOp;
	if (hasOther) {
		if (typeof value.other !== "string") {
			return { error: "telemetry assertion other must be a dotted identifier" };
		}
		const otherError = validatePath(value.other);
		if (otherError) return { error: otherError };
		return { kind: "compare", path: value.path, op, rhs: { type: "path", path: value.other } };
	}
	if (!isScalar(value.value)) {
		return { error: "telemetry assertion value must be a number, boolean, string, or null" };
	}
	if (typeof value.value === "number" && !Number.isFinite(value.value)) {
		return { error: "telemetry assertion numeric value must be finite" };
	}
	return { kind: "compare", path: value.path, op, rhs: { type: "value", value: value.value } };
}

function validatePath(path: string): string | undefined {
	const segments = path.split(".");
	if (segments.length === 0 || segments.length > MAX_PATH_SEGMENTS) {
		return "telemetry assertion path is invalid";
	}
	for (const segment of segments) {
		if (!IDENT.test(segment) || FORBIDDEN_SEGMENTS.has(segment)) {
			return "telemetry assertion path is invalid";
		}
	}
	return undefined;
}

function evalExpr(expr: AssertionExpr, root: Record<string, unknown>): InternalEval {
	if (expr.kind === "all") {
		return combineList(
			expr.items.map((item) => evalExpr(item, root)),
			"all",
		);
	}
	if (expr.kind === "any") {
		return combineList(
			expr.items.map((item) => evalExpr(item, root)),
			"any",
		);
	}
	if (expr.kind === "not") {
		const inner = evalExpr(expr.item, root);
		if (inner.state === "passed") return { state: "failed", note: "negated assertion was true" };
		if (inner.state === "failed") return { state: "passed" };
		return inner;
	}
	return evalCompare(expr, root);
}

function combineList(results: readonly InternalEval[], mode: "all" | "any"): InternalEval {
	const error = results.find((result) => result.state === "error");
	if (error) return error;
	const missing = results.filter((result) => result.state === "inconclusive");
	const failed = results.filter((result) => result.state === "failed");
	const passed = results.filter((result) => result.state === "passed");
	if (mode === "all") {
		if (missing.length > 0) return missing[0]!;
		if (failed.length > 0) return failed[0]!;
		return { state: "passed" };
	}
	if (passed.length > 0) return { state: "passed" };
	if (missing.length > 0) return missing[0]!;
	if (failed.length > 0) return failed[0]!;
	return { state: "failed", note: "no assertion clause passed" };
}

function evalCompare(expr: Extract<AssertionExpr, { kind: "compare" }>, root: Record<string, unknown>): InternalEval {
	const left = readPath(root, expr.path);
	if (!left.found) {
		return { state: "inconclusive", note: `telemetry path ${expr.path} is missing` };
	}
	let right: unknown;
	if (expr.rhs.type === "value") {
		right = expr.rhs.value;
	} else {
		const other = readPath(root, expr.rhs.path);
		if (!other.found) {
			return { state: "inconclusive", note: `telemetry path ${expr.rhs.path} is missing` };
		}
		right = other.value;
	}
	const compared = compareValues(left.value, expr.op, right);
	if (compared.state === "error") return compared;
	if (compared.pass) return { state: "passed" };
	const rhsLabel = expr.rhs.type === "value" ? JSON.stringify(expr.rhs.value) : expr.rhs.path;
	return {
		state: "failed",
		note: `assertion failed: ${expr.path} ${expr.op} ${rhsLabel}`,
	};
}

function compareValues(
	left: unknown,
	op: CompareOp,
	right: unknown,
): { readonly state: "ok"; readonly pass: boolean } | { readonly state: "error"; readonly note: string } {
	if (op === "eq") return { state: "ok", pass: Object.is(left, right) || (left === null && right === null) };
	if (op === "ne") return { state: "ok", pass: !(Object.is(left, right) || (left === null && right === null)) };
	if (typeof left !== "number" || typeof right !== "number" || !Number.isFinite(left) || !Number.isFinite(right)) {
		return { state: "error", note: "relational comparison requires finite numbers" };
	}
	if (op === "gt") return { state: "ok", pass: left > right };
	if (op === "gte") return { state: "ok", pass: left >= right };
	if (op === "lt") return { state: "ok", pass: left < right };
	return { state: "ok", pass: left <= right };
}

function readPath(
	root: Record<string, unknown>,
	path: string,
): { readonly found: true; readonly value: unknown } | { readonly found: false } {
	let current: unknown = root;
	for (const segment of path.split(".")) {
		if (!isPlainObject(current) || !Object.hasOwn(current, segment)) {
			return { found: false };
		}
		current = current[segment];
	}
	return { found: true, value: current };
}

function booleanInputResult(payload: unknown): boolean | undefined {
	if (!isPlainObject(payload) || payload.ok !== true || typeof payload.result !== "boolean") {
		return undefined;
	}
	return payload.result;
}

function numericProbeResult(payload: unknown): number | undefined {
	if (typeof payload === "number" && Number.isFinite(payload)) return payload;
	if (!isPlainObject(payload)) return undefined;
	if (typeof payload.result === "number" && Number.isFinite(payload.result)) return payload.result;
	return undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isScalar(value: unknown): value is Scalar {
	return value === null || typeof value === "number" || typeof value === "boolean" || typeof value === "string";
}
