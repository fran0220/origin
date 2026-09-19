import type { ReactNode } from "react";

export function useTranslation(): {
	locale: string;
	t: (key: string, params?: Record<string, string | number>) => string;
} {
	return {
		locale: "zh",
		t: (key, params) => {
			if (!params) return key;
			return Object.entries(params).reduce(
				(text, [name, value]) => text.replaceAll(`{{${name}}}`, String(value)),
				key,
			);
		},
	};
}

export interface PluginCardProps {
	descriptor: { type: string; payload?: unknown; title?: string };
	pending: boolean;
	message: { id: string; role: string; text: string };
}

export interface PluginNewSessionContext {
	target: { kind: string; id: string; contributedId?: string } | null;
	mentionedAbilities: { skills: readonly string[]; mcpServers: readonly string[] };
	draft: string;
	cwd: string | null;
	composer: {
		attach(attachment: unknown): void;
		insertText(text: string, options?: { position?: "start" | "end" }): void;
	};
}

export function definePlugin(plugin: unknown): unknown {
	return plugin;
}

export type PluginContext = unknown;
export type ReactSlot = ReactNode;
