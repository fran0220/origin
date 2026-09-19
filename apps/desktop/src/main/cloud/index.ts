/**
 * Vetta 云服务主进程入口（唯一入口）。
 *
 * 宿主只允许通过 `startCloudMain()` 挂载本模块，且必须包在
 * `isCloudBuildEnabled()` 判断里用动态 import 加载——lite 构建
 * （VETTA_CLOUD_ENABLED=false）经常量折叠后整个模块不进产物。
 *
 * 宿主功能需要云能力（远程模型目录、网关中转、token refresh）时，
 * 一律经 `../cloud-bridge.js` 的 CloudBridge 间接调用，由本入口注入实现。
 */

import { ipcMain } from "electron";
import { setCloudBridge } from "../cloud-bridge.js";
import { getAccountDirectoryService } from "../connections/account-directory.js";
import { getConnectionCatalog } from "../connections/catalog.js";
import { DEFAULT_SERVER_URL } from "../constants.js";
import { writeAccountTokens } from "../credentials/account-token-store.js";
import { getMainWindow } from "../window-manager.js";
import { consumeOAuthCallback, reopenOAuthLogin, startOAuthLogin } from "./auth/oauth-login.js";
import { setLoopbackCallbackHandler } from "./auth/oauth-loopback.js";
import { startPkceOrLegacyLogin } from "./auth/pkce-login.js";
import { fetchRemoteProviders, registerCloudAuthIpc, tryRefreshAccessToken } from "./auth-session.js";
import { requestVettaGateway } from "./gateway.js";

export interface CloudMainHandle {
	/**
	 * 处理 OAuth 回调深链（origin://oauth/callback，兼容 vetta://）。
	 * 返回是否命中本模块的回调路径；未命中时宿主可继续交给其它处理器。
	 */
	handleProtocolUrl(parsed: URL): boolean;
	teardown(): void;
}

export interface StartCloudMainOptions {
	/**
	 * 开发模式 loopback HTTP 回调进来时，宿主用它把窗口抢回前台并转发 URL
	 * （见 main.ts 的 receiveProtocolUrl）。
	 */
	receiveProtocolUrl(rawUrl: string): void;
}

export function startCloudMain(options: StartCloudMainOptions): CloudMainHandle {
	// 开发模式没有可用的自定义 scheme，回调从本机 loopback HTTP 服务进来。
	setLoopbackCallbackHandler(options.receiveProtocolUrl);

	// 授权登录由主进程发起：state 的生成与校验都在这里，渲染层碰不到，
	// 未通过校验的 token 也就永远进不了渲染层。
	ipcMain.handle("vetta:auth:start-oauth", async () => {
		const mode = await startPkceOrLegacyLogin();
		if (mode === "legacy") {
			await startOAuthLogin();
			return;
		}
	});

	ipcMain.handle("vetta:auth:reopen-oauth", async () => {
		await reopenOAuthLogin();
	});

	ipcMain.handle(
		"vetta:cloud:request",
		async (
			_event,
			path: unknown,
			options: { method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown } | undefined,
		) => {
			if (typeof path !== "string" || path.length === 0) {
				return { ok: false, status: 400, code: -1, message: "path required" };
			}
			return requestVettaGateway({
				path: path.replace(/^\/+/, ""),
				method: options?.method,
				body: options?.body,
			});
		},
	);

	const teardownAuthIpc = registerCloudAuthIpc();

	// 宿主功能（模型探测回退 / 网关能力 / 市场安装鉴权）经 bridge 使用云服务，
	// 不直接 import cloud 内部实现。
	setCloudBridge({
		fetchRemoteProviders,
		requestGateway: requestVettaGateway,
		tryRefreshAccessToken,
	});

	return {
		handleProtocolUrl(parsed: URL): boolean {
			if (parsed.hostname !== "oauth" || !parsed.pathname.startsWith("/callback")) return false;
			const mainWindow = getMainWindow();
			if (!mainWindow) return true;
			const tokens = consumeOAuthCallback(parsed);
			if (tokens) {
				writeAccountTokens(tokens.token, tokens.refreshToken);
				admitSignedInConnection(tokens.token);
				void import("../connections/runtime-binding.js").then(({ bindModelRuntimeToConnectionRelays }) =>
					bindModelRuntimeToConnectionRelays(),
				);
				mainWindow.webContents.send("vetta:auth:oauth-callback", { signedIn: true });
			} else {
				mainWindow.webContents.send("vetta:auth:oauth-rejected");
			}
			return true;
		},
		teardown(): void {
			setCloudBridge(null);
			teardownAuthIpc();
			ipcMain.removeHandler("vetta:auth:start-oauth");
			ipcMain.removeHandler("vetta:auth:reopen-oauth");
			ipcMain.removeHandler("vetta:cloud:request");
		},
	};
}

function admitSignedInConnection(accessToken: string): void {
	try {
		const origin = new URL(DEFAULT_SERVER_URL).origin;
		getConnectionCatalog().upsertSignedIn({
			displayName: "Vetta",
			endpoint: origin,
			secret: accessToken,
			account: { subject: "signed-in", username: "signed-in", displayName: "Vetta" },
		});
		getAccountDirectoryService().admit(origin, "signed-in", origin);
	} catch {
		// Discovery / endpoint parse failure must not block login persistence.
	}
}
