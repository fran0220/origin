/**
 * Desktop 打包与安装包的用户可见产品身份。
 *
 * `APP_RUNTIME_NAME`（asar 内 package.json#name / Electron app.getName）是 `origin`。
 * safeStorage 主密钥按该名字派生；本仓库没有旧凭证需要解密兼容。
 */
export const APP_RUNTIME_NAME = "origin";
export const PRODUCT_NAME = "Origin";
export const EXECUTABLE_NAME = "Origin";
export const APP_ID = "com.origin.desktop";
export const PROTOCOL_SCHEME = "origin";
export const LEGACY_PROTOCOL_SCHEME = "vetta";
export const PROTOCOL_SCHEMES = Object.freeze([PROTOCOL_SCHEME, LEGACY_PROTOCOL_SCHEME]);
export const COMPUTER_USE_APP_NAME = "Origin Computer Use";
export const COMPUTER_USE_BUNDLE_ID = "com.origin.desktop.computer-use";
export const WINDOWS_STORE_DIR_NAME = "Origin";
export const LINUX_INSTALL_DIR = "/opt/Origin";
