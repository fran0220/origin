import type { PluginContext } from "@origin-org/plugin-sdk";

export function applyStudioPanelWidth(ctx: PluginContext, active: boolean): void {
	if (active) ctx.ui.setActivityPanelWidth("max");
}
