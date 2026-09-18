# ADR-0119：产品名称收敛为 Origin

## 状态

已接受

## 背景

本仓库此前对外使用 Vetta / OpenVetta / Vetta Go 等名称。产品要取代 Sophon，并把用户可见身份统一为 Origin。与此同时，内部仍有数千处 `vetta` 标识符：`@vetta/*` 包、`~/.vetta` 数据目录、IPC 通道 `vetta:`、preload 的 `window.vetta`，以及并行线程持续新增的同名代码。一次性改内部标识会与那些线程冲突，也会打断存量用户的凭据与数据目录。

Electron `app.getName()` / asar 内 `package.json#name` 仍是 `vetta`。safeStorage 主密钥按该名字派生，改名会让已保存的 API key 无法解密。

## 决策

分两阶段改名。

### 第一阶段（本次）

只改用户可见的产品身份与对外命名：

1. Desktop 安装包 `productName` / `executableName` 为 Origin，`appId` 为 `com.origin.desktop`，产物文件名 `Origin-<version>-...`。
2. 深链 scheme 主注册 `origin://`，同时继续注册 `vetta://` 作为兼容监听。OAuth 打包回调改为 `origin://oauth/callback`，消费时两种 scheme 都接受。
3. i18n catalog、原生菜单、托盘、关于面板、窗口标题、文档站与根 README 中的产品名改为 Origin；托管模型显示名改为 Origin Go，provider id `vetta-go` 不变。
4. 移动端显示名与 IM 网关机器人/设备显示名改为 Origin。Go module path 与 Kotlin 包名不变。
5. 运行时名 `APP_RUNTIME_NAME = "vetta"` 与 `~/.vetta` 不变。

`vetta://` 兼容窗口持续到第二阶段完成并发布至少一个大版本之后再下线；下线前需公告，并确认服务端授权回调已切到 `origin://`。

### 第二阶段（方案与脚本已写入 `scripts/rename/`，不在本次执行）

由用户在其它线程合并后另行触发：

- npm scope `@vetta/*` → `@origin/*`、`@vetta-org/*` → `@origin-org/*`（可参数化）
- 数据目录 `~/.vetta` → `~/.origin`，启动时原子迁移；环境变量 `VETTA_*` → `ORIGIN_*`，旧变量兼容回退并告警
- IPC `vetta:` → `origin:`，`window.vetta` → `window.origin`（preload 双暴露一个版本）
- 插件 SDK 包名与 `pluginApiVersion` 兼容策略

## 备选方案

- 一次改完全部内部标识：与并行线程冲突面过大，且会立刻破坏 safeStorage 与用户数据目录。
- 只改文档不改安装包：用户在 Dock、开始菜单和关于对话框仍看到 Vetta，产品替换目标无法达成。
- 立刻改 `APP_RUNTIME_NAME`：存量凭据全部失效，必须先做密钥迁移，超出第一阶段范围。

## 后果

新安装包显示 Origin，旧 `vetta://` 登录回调在兼容窗口内仍可用。开发者文档与 AGENTS.md 说明 `vetta` 是内部遗留标识。第二阶段执行前，代码、锁文件、CI 产物名仍使用 `@vetta/*`。
