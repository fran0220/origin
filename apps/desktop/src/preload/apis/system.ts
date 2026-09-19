import type { IpcRenderer, IpcRendererEvent, WebUtils } from "electron";
import { PERSIST_IMAGE_FILES_CHANNEL } from "../../shared/image-cache.js";
import { PROJECTS_CHANNELS } from "../../shared/projects-ipc.js";
import type { DesktopApi } from "../api.js";
import type { DesktopThemeChangeRequest } from "../api-types/theme.js";
import { FS_READ_TEXT_PREVIEW_CHANNEL } from "../fs-types.js";
import { onIpcEvent, onIpcVoidEvent } from "./helper.js";

export function createSystemApi(
	ipc: IpcRenderer,
	webUtils: WebUtils,
): Pick<
	DesktopApi,
	| "dialog"
	| "theme"
	| "fs"
	| "skills"
	| "config"
	| "knowledge"
	| "models"
	| "mcp"
	| "media"
	| "runtimes"
	| "settings"
	| "connections"
	| "cloud"
	| "subscription"
	| "shell"
	| "clipboard"
	| "window"
	| "auth"
	| "updater"
	| "tray"
	| "debug"
	| "diagnostics"
	| "project"
	| "recording"
	| "permissions"
> {
	return {
		dialog: {
			selectFolder: () => ipc.invoke("origin:dialog:select-folder"),
			selectFolders: () => ipc.invoke("origin:dialog:select-folders"),
			selectImages: () => ipc.invoke("origin:dialog:select-images"),
			selectFiles: (defaultPath) => ipc.invoke("origin:dialog:select-files", defaultPath),
			openFileContents: (options) => ipc.invoke("origin:dialog:open-file-contents", options),
			saveHtml: (defaultFileName, content) => ipc.invoke("origin:dialog:save-html", defaultFileName, content),
			saveData: (defaultFileName, content, encoding, options) =>
				ipc.invoke("origin:dialog:save-data", defaultFileName, content, encoding, options),
			saveCopy: (sourcePath, options) => ipc.invoke("origin:dialog:save-copy", sourcePath, options),
			persistImages: (sessionId, images) => ipc.invoke("origin:dialog:persist-images", sessionId, images),
			persistImageFiles: async (sessionId, files) => {
				const images = await Promise.all(
					files.map(async (file) => {
						const path = webUtils.getPathForFile(file);
						return {
							id: crypto.randomUUID(),
							mimeType: file.type || "image/png",
							source: path
								? ({ kind: "file-path", path } as const)
								: ({ kind: "bytes", data: await file.arrayBuffer() } as const),
						};
					}),
				);
				return ipc.invoke(PERSIST_IMAGE_FILES_CHANNEL, sessionId, images);
			},
		},
		theme: {
			set: (mode) => ipc.invoke("origin:theme:set", mode),
			getNative: () => ipc.invoke("origin:theme:get-native"),
			onNativeChanged: (handler) => onIpcEvent(ipc, "origin:theme:native-changed", handler),
			onModeRequested: (handler) => onIpcEvent(ipc, "origin:theme:mode-requested", handler),
			onChangeRequested: (handler) => {
				const listener = (_event: IpcRendererEvent, data: unknown) => {
					const request = data as {
						requestId?: unknown;
						mode?: unknown;
						themeId?: unknown;
						cursorStyle?: unknown;
					};
					if (typeof request.requestId !== "string") return;
					const changeRequest: DesktopThemeChangeRequest = {};
					if (request.mode === "light" || request.mode === "dark" || request.mode === "auto") {
						changeRequest.mode = request.mode;
					}
					if (typeof request.themeId === "string") {
						changeRequest.themeId = request.themeId;
					}
					if (request.cursorStyle === "default" || request.cursorStyle === "stoat") {
						changeRequest.cursorStyle = request.cursorStyle;
					}
					void Promise.resolve(handler(changeRequest)).then(
						(state) => ipc.send("origin:theme:change-response", { requestId: request.requestId, state }),
						(error: unknown) =>
							ipc.send("origin:theme:change-response", {
								requestId: request.requestId,
								error: error instanceof Error ? error.message : String(error),
							}),
					);
				};
				ipc.on("origin:theme:change-requested", listener);
				return () => ipc.removeListener("origin:theme:change-requested", listener);
			},
			onStateRequested: (handler) => {
				const listener = (_event: IpcRendererEvent, data: unknown) => {
					const request = data as { requestId?: unknown };
					if (typeof request.requestId !== "string") return;
					void Promise.resolve(handler()).then(
						(state) => ipc.send("origin:theme:state-response", { requestId: request.requestId, state }),
						(error: unknown) =>
							ipc.send("origin:theme:state-response", {
								requestId: request.requestId,
								error: error instanceof Error ? error.message : String(error),
							}),
					);
				};
				ipc.on("origin:theme:state-requested", listener);
				return () => ipc.removeListener("origin:theme:state-requested", listener);
			},
			onHelpRequested: (handler) => {
				const listener = (_event: IpcRendererEvent, data: unknown) => {
					const request = data as { requestId?: unknown };
					if (typeof request.requestId !== "string") return;
					void Promise.resolve(handler()).then(
						(help) => ipc.send("origin:theme:help-response", { requestId: request.requestId, help }),
						(error: unknown) =>
							ipc.send("origin:theme:help-response", {
								requestId: request.requestId,
								error: error instanceof Error ? error.message : String(error),
							}),
					);
				};
				ipc.on("origin:theme:help-requested", listener);
				return () => ipc.removeListener("origin:theme:help-requested", listener);
			},
		},
		fs: {
			readDir: (dirPath) => ipc.invoke("origin:fs:read-dir", dirPath),
			readFile: (filePath) => ipc.invoke("origin:fs:read-file", filePath),
			readTextPreviewFile: (filePath) => ipc.invoke(FS_READ_TEXT_PREVIEW_CHANNEL, filePath),
			readEditableTextFile: (filePath) => ipc.invoke("origin:fs:read-editable-text", filePath),
			saveEditableTextFile: (filePath, content, options) =>
				ipc.invoke("origin:fs:save-editable-text", filePath, content, options),
			writeFile: (filePath, content, encoding) =>
				ipc.invoke("origin:fs:write-file", filePath, content, encoding ?? "utf8"),
			stat: (filePath) => ipc.invoke("origin:fs:stat", filePath),
			rename: (oldPath, newPath) => ipc.invoke("origin:fs:rename", oldPath, newPath),
			delete: (targetPath) => ipc.invoke("origin:fs:delete", targetPath),
			move: (sourcePath, destDir) => ipc.invoke("origin:fs:move", sourcePath, destDir),
			prepareDrop: (files, destinationDirectory) => {
				const sourcePaths = files.map((file) => webUtils.getPathForFile(file)).filter(Boolean);
				return ipc.invoke("origin:file-transfer:prepare-drop", sourcePaths, destinationDirectory);
			},
			prepareTransfer: (sourcePaths, destinationDirectory) =>
				ipc.invoke("origin:file-transfer:prepare-drop", [...sourcePaths], destinationDirectory),
			commitDrop: (planId, action, conflictPolicy) =>
				ipc.invoke("origin:file-transfer:commit-drop", planId, action, conflictPolicy),
			cancelDrop: (planId) => ipc.invoke("origin:file-transfer:cancel-drop", planId),
			startDrag: (paths) => ipc.send("origin:file-transfer:start-drag", [...paths]),
			cacheDragIcon: (path, pngDataUrl) => ipc.send("origin:file-transfer:cache-drag-icon", path, pngDataUrl),
			createEntry: (parentDirectory, name, kind) =>
				ipc.invoke("origin:fs:create-entry", parentDirectory, name, kind),
			createDirectory: (dirPath) => ipc.invoke("origin:fs:create-directory", dirPath),
			listSubDirs: (dirPath) => ipc.invoke("origin:fs:list-sub-dirs", dirPath),
			listFilesRecursive: (rootPath) => ipc.invoke("origin:fs:list-files-recursive", rootPath),
			watchDir: (dirPath) => ipc.invoke("origin:fs:watch-dir", dirPath),
			unwatchDir: (dirPath) => ipc.invoke("origin:fs:unwatch-dir", dirPath),
			onDirChanged: (handler) => onIpcEvent(ipc, "origin:fs:dir-changed", handler),
			pathForFile: (file) => webUtils.getPathForFile(file),
		},
		skills: {
			list: (cwd) => ipc.invoke("origin:skills:list", cwd),
			installFromMarket: (name, archiveBuffer, type, meta) =>
				ipc.invoke("origin:skills:install-from-market", name, archiveBuffer, type, meta),
			installFromMarketSlug: (type, slug) => ipc.invoke("origin:skills:install-from-market-slug", type, slug),
			importCustom: (archiveBuffer) => ipc.invoke("origin:skills:import-custom", archiveBuffer),
			uninstall: (name, type) => ipc.invoke("origin:skills:uninstall", name, type),
			toggle: (name) => ipc.invoke("origin:skills:toggle", name),
			getMarketManifest: () => ipc.invoke("origin:skills:get-market-manifest"),
			getSkillMdPath: (name, type) => ipc.invoke("origin:skills:get-skill-md-path", name, type),
		},
		config: {
			get: () => ipc.invoke("origin:config:get"),
			set: (config) => ipc.invoke("origin:config:set", config),
			onShortcutsChanged: (handler) => onIpcEvent(ipc, "origin:shortcuts:changed", handler),
			onProjectsChanged: (handler) => onIpcVoidEvent(ipc, PROJECTS_CHANNELS.CHANGED, handler),
		},
		knowledge: {
			scanNow: () => ipc.invoke("origin:kb:scan-now"),
			retryFailed: () => ipc.invoke("origin:kb:retry-failed"),
			reload: () => ipc.invoke("origin:kb:reload"),
			list: () => ipc.invoke("origin:kb:list"),
			listDir: (kbId, relPath) => ipc.invoke("origin:kb:list-dir", kbId, relPath),
			fileStatuses: () => ipc.invoke("origin:kb:statuses"),
			addFiles: (kbId, sourcePaths, move) => ipc.invoke("origin:kb:add-files", kbId, sourcePaths, move),
			deleteEntry: (kbId, relPath) => ipc.invoke("origin:kb:delete-entry", kbId, relPath),
			renameEntry: (kbId, relPath, newName) => ipc.invoke("origin:kb:rename-entry", kbId, relPath, newName),
			create: (name) => ipc.invoke("origin:kb:create", name),
			delete: (name) => ipc.invoke("origin:kb:delete", name),
			rename: (oldName, newName) => ipc.invoke("origin:kb:rename", oldName, newName),
			clearWiki: () => ipc.invoke("origin:kb:clear-wiki"),
			clearRecords: () => ipc.invoke("origin:kb:clear-records"),
			deleteWiki: (kbId, relPaths) => ipc.invoke("origin:kb:delete-wiki", kbId, relPaths),
			isProcessing: () => ipc.invoke("origin:kb:is-processing"),
			onProcessingChanged: (handler) => onIpcEvent(ipc, "origin:kb:processing-changed", handler),
			onStatusesChanged: (handler) => onIpcEvent(ipc, "origin:kb:statuses-changed", handler),
		},
		models: {
			get: () => ipc.invoke("origin:models:get"),
			set: (config) => ipc.invoke("origin:models:set", config),
			copyApiKey: (providerId) => ipc.invoke("origin:models:copy-api-key", providerId),
			fetchRemote: () => ipc.invoke("origin:models:fetch-remote"),
			listPresets: () => ipc.invoke("origin:models:list-presets"),
			refreshPresetModels: (providerId, apiKey) =>
				ipc.invoke("origin:models:refresh-preset-models", providerId, apiKey),
			refreshPresetCatalog: () => ipc.invoke("origin:models:refresh-preset-catalog"),
			onPresetsUpdated: (handler) => onIpcVoidEvent(ipc, "origin:models:presets-updated", handler),
			probe: (ref) => ipc.invoke("origin:models:probe", ref),
			fetchProviderModels: (providerName) => ipc.invoke("origin:models:fetch-provider-models", providerName),
			onChanged: (handler) => onIpcEvent(ipc, "origin:models:changed", handler),
		},
		mcp: {
			get: () => ipc.invoke("origin:mcp:get"),
			set: (config) => ipc.invoke("origin:mcp:set", config),
			login: (serverName, options) => ipc.invoke("origin:mcp:login", serverName, options),
			logout: (serverName) => ipc.invoke("origin:mcp:logout", serverName),
			hasAuth: (serverName) => ipc.invoke("origin:mcp:has-auth", serverName),
			authStatus: (serverNames) => ipc.invoke("origin:mcp:auth-status", serverNames),
			getSetupLoginStatus: (serverName) => ipc.invoke("origin:mcp:get-setup-login-status", serverName),
			startSetupLogin: (serverName, requestId) => ipc.invoke("origin:mcp:start-setup-login", serverName, requestId),
			cancelSetupLogin: (requestId) => ipc.invoke("origin:mcp:cancel-setup-login", requestId),
			clearSetupLogin: (serverName) => ipc.invoke("origin:mcp:clear-setup-login", serverName),
		},
		media: {
			listProviders: () => ipc.invoke("origin:media:list-providers"),
			getAudioMetadata: (filePath) => ipc.invoke("origin:media:audio-metadata", filePath),
		},
		runtimes: {
			getStatus: () => ipc.invoke("origin:runtimes:get-status"),
			reinstall: (type) => ipc.invoke("origin:runtimes:reinstall", type),
			redetect: () => ipc.invoke("origin:runtimes:redetect"),
		},
		recording: {
			start: (request) => ipc.invoke("origin:recording:start", request),
			stop: (recordingId) => ipc.invoke("origin:recording:stop", recordingId),
			cancel: (recordingId) => ipc.invoke("origin:recording:cancel", recordingId),
			list: (query) => ipc.invoke("origin:recording:list", query),
			read: (recordingId) => ipc.invoke("origin:recording:read", recordingId),
			sample: (request) => ipc.invoke("origin:recording:sample", request),
			clear: (recordingId) => ipc.invoke("origin:recording:clear", recordingId),
			probe: (recordingId, kind, payload) => ipc.invoke("origin:recording:probe", recordingId, kind, payload),
		},
		settings: {
			getServerUrl: () => ipc.invoke("origin:settings:get-server-url"),
			getSiteUrl: () => ipc.invoke("origin:settings:get-site-url"),
			getServerToken: () => ipc.invoke("origin:settings:get-server-token"),
			setServerToken: (token) => ipc.invoke("origin:settings:set-server-token", token),
			getServerRefreshToken: () => ipc.invoke("origin:settings:get-server-refresh-token"),
			setServerRefreshToken: (token) => ipc.invoke("origin:settings:set-server-refresh-token", token),
		},
		connections: {
			list: () => ipc.invoke("origin:connections:list"),
			upsert: (draft) => ipc.invoke("origin:connections:upsert", draft),
			remove: (id) => ipc.invoke("origin:connections:remove", id),
			quota: (id) => ipc.invoke("origin:connections:quota", id),
		},
		cloud: {
			request: (path, options) => ipc.invoke("origin:cloud:request", path, options),
		},
		subscription: {
			getStatus: () => ipc.invoke("origin:subscription:status"),
		},
		shell: {
			showInFolder: (fullPath) => ipc.invoke("origin:shell:show-in-folder", fullPath),
			showItemInFolder: (fullPath) => ipc.invoke("origin:shell:show-item-in-folder", fullPath),
			openExternal: (url) => ipc.invoke("origin:shell:open-external", url),
		},
		clipboard: {
			writeImage: (dataUrl) => ipc.invoke("origin:clipboard:write-image", dataUrl),
			writeUserMessage: (request) => ipc.invoke("origin:clipboard:write-user-message", request),
			pasteUserMessage: (sessionId) => ipc.invoke("origin:clipboard:paste-user-message", sessionId),
		},
		window: {
			minimize: () => ipc.invoke("origin:window:minimize"),
			maximize: () => ipc.invoke("origin:window:maximize"),
			close: () => ipc.invoke("origin:window:close"),
			isMaximized: () => ipc.invoke("origin:window:is-maximized"),
			onMaximizedChanged: (handler) => onIpcEvent(ipc, "origin:window:maximized-changed", handler),
			toggleAlwaysOnTop: () => ipc.invoke("origin:window:toggle-always-on-top"),
			isAlwaysOnTop: () => ipc.invoke("origin:window:is-always-on-top"),
			captureRegion: (rect, defaultFileName) => ipc.invoke("origin:window:capture-region", rect, defaultFileName),
		},
		auth: {
			openExternal: (url) => ipc.invoke("origin:shell:open-external", url),
			startOAuth: () => ipc.invoke("origin:auth:start-oauth"),
			reopenOAuth: () => ipc.invoke("origin:auth:reopen-oauth"),
			refreshToken: () => ipc.invoke("origin:auth:refresh-token"),
			signOut: () => ipc.invoke("origin:auth:sign-out"),
			sseUrl: () => ipc.invoke("origin:auth:sse-url"),
			onOAuthCallback: (handler) => onIpcEvent(ipc, "origin:auth:oauth-callback", handler),
			onOAuthRejected: (handler) => onIpcVoidEvent(ipc, "origin:auth:oauth-rejected", handler),
			onUnauthorized: (handler) => onIpcVoidEvent(ipc, "origin:auth:unauthorized", handler),
			onTokenRefreshed: (handler) => onIpcEvent(ipc, "origin:auth:token-refreshed", handler),
		},
		updater: {
			check: () => ipc.invoke("origin:updater:check"),
			sync: () => ipc.invoke("origin:updater:sync"),
			getState: () => ipc.invoke("origin:updater:get-state"),
			getCurrentVersion: () => ipc.invoke("origin:updater:get-current-version"),
			download: () => ipc.invoke("origin:updater:download"),
			install: () => ipc.invoke("origin:updater:install"),
			dismiss: () => ipc.invoke("origin:updater:dismiss"),
			cancel: () => ipc.invoke("origin:updater:cancel"),
			onStateChanged: (handler) => onIpcEvent(ipc, "origin:updater:state", handler),
		},
		tray: {
			setQuitBehavior: (hideToTray) => ipc.invoke("origin:tray:set-quit-behavior", hideToTray),
			getQuitBehavior: () => ipc.invoke("origin:tray:get-quit-behavior"),
			setTooltip: (text) => ipc.invoke("origin:tray:set-tooltip", text),
		},
		debug: {
			parseToolCalls: (sessionPath) => ipc.invoke("origin:debug:parse-tool-calls", sessionPath),
			listRequestFiles: (projectName, sessionId) =>
				ipc.invoke("origin:debug:list-request-files", projectName, sessionId),
			clearDebugDir: () => ipc.invoke("origin:debug:clear-debug-dir"),
		},
		diagnostics: {
			exportDiagnosticsPackage: () => ipc.invoke("origin:diagnostics:export"),
			getLogDir: () => ipc.invoke("origin:diagnostics:get-log-dir"),
		},
		project: {
			export: (projectDir) => ipc.invoke("origin:project:export", projectDir),
			import: () => ipc.invoke("origin:project:import"),
			readMeta: (projectDir) => ipc.invoke("origin:project:read-meta", projectDir),
			resolve: (cwd) => ipc.invoke("origin:project:resolve", cwd),
		},
		permissions: {
			checkAll: () => ipc.invoke("origin:permissions:check-all"),
			openPane: (kind) => ipc.invoke("origin:permissions:open-pane", kind),
		},
	};
}
