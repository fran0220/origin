export const ORIGIN_PLUGIN_DEV_PROTOCOL_VERSION = 1;

export type OriginPluginDevEvent =
	| {
			type: "ready";
			protocolVersion: typeof ORIGIN_PLUGIN_DEV_PROTOCOL_VERSION;
			pluginId: string;
			entryUrl: string;
			origin: string;
		}
	| {
			type: "update";
			pluginId: string;
			reason: "entry" | "full-reload" | "resource";
			path?: string;
			triggeredBy?: string;
		}
	| {
			type: "error";
			pluginId?: string;
			message: string;
		};

type OriginPluginDevEventListener = (event: OriginPluginDevEvent) => void;

let listener: OriginPluginDevEventListener | undefined;

export function setOriginPluginDevEventListener(nextListener: OriginPluginDevEventListener | undefined): void {
	listener = nextListener;
}

export function emitOriginPluginDevEvent(event: OriginPluginDevEvent): void {
	listener?.(event);
}
