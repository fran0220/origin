import { DIAL_MODES, type DialMode, isDialMode } from "@vetta/runtime-core";

export { DIAL_MODES, isDialMode, type DialMode };

export const DEFAULT_DIAL_MODE: DialMode = "medium";

export const DIAL_MODE_LABELS: Record<DialMode, string> = {
	low: "Low",
	medium: "Medium",
	high: "High",
	ultra: "Ultra",
};

/** 每个档位的默认推理努力；具体模型由 Connection pin 覆盖。 */
export const DIAL_MODE_DEFAULT_REASONING: Record<DialMode, string> = {
	low: "low",
	medium: "medium",
	high: "high",
	ultra: "xhigh",
};

export function normalizeDialMode(value: unknown): DialMode {
	return typeof value === "string" && isDialMode(value) ? value : DEFAULT_DIAL_MODE;
}

export function freezeDialMode(existing: unknown, requested: unknown): DialMode {
	if (typeof existing === "string" && isDialMode(existing)) return existing;
	return normalizeDialMode(requested);
}
