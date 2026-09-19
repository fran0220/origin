import type { IpcRenderer } from "electron";
import type { DesktopApi } from "../api.js";
import { onIpcEvent, onIpcVoidEvent } from "./helper.js";

export function createAbilitiesApi(ipc: IpcRenderer): Pick<DesktopApi, "abilities"> {
	return {
		abilities: {
			getLedger: () => ipc.invoke("origin:abilities:get-ledger"),
			listLocalPresentations: () => ipc.invoke("origin:abilities:list-local-presentations"),
			recordMcpInstall: (runtimeName, version, metadata) =>
				ipc.invoke("origin:abilities:record-mcp-install", runtimeName, version, metadata),
			listOpenMarketplace: () => ipc.invoke("origin:abilities:list-open-marketplace"),
			refreshOpenMarketplace: () => ipc.invoke("origin:abilities:refresh-open-marketplace"),
			listOpenMarketplaces: () => ipc.invoke("origin:abilities:list-open-marketplaces"),
			refreshOpenMarketplaces: () => ipc.invoke("origin:abilities:refresh-open-marketplaces"),
			listMarketplaceSources: () => ipc.invoke("origin:abilities:list-marketplace-sources"),
			addMarketplaceSource: (input) => ipc.invoke("origin:abilities:add-marketplace-source", input),
			updateMarketplaceSource: (id, input) => ipc.invoke("origin:abilities:update-marketplace-source", id, input),
			clearMarketplaceSourceCredential: (id) =>
				ipc.invoke("origin:abilities:clear-marketplace-source-credential", id),
			removeMarketplaceSource: (id) => ipc.invoke("origin:abilities:remove-marketplace-source", id),
			refreshMarketplaceSource: (id) => ipc.invoke("origin:abilities:refresh-marketplace-source", id),
			onOpenMarketplacesUpdated: (handler) =>
				onIpcVoidEvent(ipc, "origin:abilities:open-marketplaces-updated", handler),
			installOpenAbility: (type, slug, sourceId) =>
				ipc.invoke("origin:abilities:install-open-ability", type, slug, sourceId),
			prepareOpenMcpAbility: (slug, sourceId) =>
				ipc.invoke("origin:abilities:prepare-open-mcp-ability", slug, sourceId),
			onMcpRuntimeProgress: (handler) => onIpcEvent(ipc, "origin:abilities:mcp-runtime-progress", handler),
			getOpenMcpSetupStatus: () => ipc.invoke("origin:abilities:get-open-mcp-setup-status"),
			removeOpenMcpRuntime: (slug, sourceId) =>
				ipc.invoke("origin:abilities:remove-open-mcp-runtime", slug, sourceId),
		},
	};
}
