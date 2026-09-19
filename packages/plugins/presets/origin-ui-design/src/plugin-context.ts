import type { PluginContext, PluginUiApi } from "@origin-org/plugin-sdk";

let pluginCtx: PluginContext | null = null;

export function setPluginCtx(ctx: PluginContext): void {
	pluginCtx = ctx;
}

export function hasPluginCtx(): boolean {
	return pluginCtx !== null;
}

export function getPluginCtx(): PluginContext {
	if (!pluginCtx) throw new Error("origin-ui-design plugin context not ready");
	return pluginCtx;
}

export function notify(options: Parameters<PluginUiApi["notify"]>[0]): void {
	pluginCtx?.ui.notify(options);
}
