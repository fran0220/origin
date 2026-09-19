/**
 * Electron `app.getName()` 的唯一事实源。
 *
 * safeStorage 的主密钥按 app 名字定位（macOS 钥匙串条目 `<name> Safe Storage`），
 * 名字不同即是两把互不通用的密钥：同一份密文只能被写入它的那一侧解开。
 * 因此打包版 asar 内 `package.json#name`（`scripts/prepare-pack.js`）与开发态的
 * `app.name` 覆盖必须始终相等，否则 `bun run dev:home` 虽然共享 `~/.origin`
 * 目录，却读不出打包版写入的 API key，并会用开发态密钥覆盖它。
 * 一致性由 `app-identity.test.ts` 机械校验。
 *
 * 修改此常量会让所有存量用户已保存的凭据无法解密。本仓库没有旧凭证需要兼容，
 * 运行时名已改为 `origin`。面向用户的产品名是 `APP_PRODUCT_NAME`。
 */
export const APP_RUNTIME_NAME = "origin";

/** 面向用户的产品名（窗口标题、托盘、安装包、关于对话框）。 */
export const APP_PRODUCT_NAME = "Origin";

/** 托管模型在选择器里的显示名；provider id `vetta-go` 仍是内部标识。 */
export const APP_HOSTED_MODEL_DISPLAY_NAME = "Origin Go";

/** 当前深链 scheme；旧 `vetta` 仍注册为兼容监听。 */
export const APP_PROTOCOL_SCHEME = "origin";
export const APP_LEGACY_PROTOCOL_SCHEME = "vetta";
export const APP_PROTOCOL_SCHEMES = [APP_PROTOCOL_SCHEME, APP_LEGACY_PROTOCOL_SCHEME] as const;

export function isAppProtocolUrl(rawUrl: string): boolean {
	return APP_PROTOCOL_SCHEMES.some((scheme) => rawUrl.startsWith(`${scheme}://`));
}
