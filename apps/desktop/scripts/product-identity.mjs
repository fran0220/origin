/**
 * Desktop 打包与安装包的用户可见产品身份。
 *
 * `APP_RUNTIME_NAME`（asar 内 package.json#name / Electron app.getName）仍是 `vetta`，
 * 因为 safeStorage 主密钥按该名字派生，第一阶段不得改。本文件只覆盖安装包显示名、
 * 可执行文件名、bundle id、深链 scheme 和产物文件名。
 */
export const APP_RUNTIME_NAME = "vetta";
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
