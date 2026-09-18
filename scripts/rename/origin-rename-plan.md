# Origin 内部标识符迁移计划（第二阶段）

第一阶段已把用户可见产品名改为 Origin，并双注册 `origin://` / `vetta://`。本文件描述第二阶段：改内部标识符。**本阶段脚本只支持 `--dry-run` 与分步执行；不要在并行线程仍大量新增 `@vetta/*` 时跑写操作。**

事实源：`scripts/rename/rename-internal-identifiers.mjs`。scope 默认 `@vetta` → `@origin`、`@vetta-org` → `@origin-org`，可用 `--from-scope` / `--to-scope` 覆盖。

## 不变量

- 第一阶段的用户可见名称保持 Origin。
- `APP_RUNTIME_NAME` / safeStorage 密钥迁移必须与数据目录迁移同一次发布，否则已保存凭据无法解密。
- ADR 历史记录不改当时用语。
- 服务端仓库 `vetta-serv`、远程 provider id `vetta-go` 是否改名由服务端仓库单独决定；客户端第二阶段只改本仓库内部标识。

## 步骤

### 1. npm scope

覆盖：所有 `package.json` 的 `name` / `dependencies` / `exports`、`bun.lock`、`tsconfig*.json` paths、`turbo.json` filter、`scripts/quality/check-package-boundaries.mjs`、`knip.config.ts`、Vite alias、文档中的包名示例。

```bash
node scripts/rename/rename-internal-identifiers.mjs --step npm-scope --dry-run
```

写操作后：`bun install` 重生 `bun.lock`，再 `bun run check`。

回滚：还原 git；未 push 前 `git revert`。已发布的 `@vetta/*` 包需在 registry 保留一个兼容版本窗口。

### 2. 数据目录与环境变量

目标：`~/.vetta` → `~/.origin`，项目级 `<cwd>/.vetta/` → `<cwd>/.origin/`。

启动策略：

1. 若 `~/.origin` 已存在，只读写新目录。
2. 若 `~/.origin` 不存在且 `~/.vetta` 存在，原子 `rename`；跨设备失败则复制并写 `.origin-migrated-from-vetta` 标记，成功后再只写新目录。
3. 环境变量优先 `ORIGIN_HOME` / `ORIGIN_CONFIG_DIR` / `ORIGIN_CODING_AGENT_DIR` / `ORIGIN_API_TOKEN`；旧 `VETTA_*` 作为回退并打警告。
4. 项目级目录双读单写：读 `.origin` 与 `.vetta`，写只进 `.origin`。

`APP_RUNTIME_NAME` 在同一步改为 `origin`，并迁移 macOS 钥匙串 / Windows DPAPI 条目。缺迁移方案不得改运行时名。

```bash
node scripts/rename/rename-internal-identifiers.mjs --step data-dir --dry-run
```

回滚：保留 `.vetta` 至确认无回退用户；迁移标记可指向源目录以便卸载。

### 3. IPC 与 preload

- 通道前缀 `vetta:` → `origin:`
- `window.vetta` → `window.origin`（preload 一个版本内同时暴露两个名字）
- 日志目录名等用户不可见路径随数据目录走，不单独改 `desktop-app`

```bash
node scripts/rename/rename-internal-identifiers.mjs --step ipc --dry-run
```

验证：现有 IPC 合同测试 + preload 类型测试。回滚：双暴露期内旧名仍可用。

### 4. 协议、插件 SDK、CI 产物

- 内部媒体/文件协议 `vetta-file` / `vetta-media` / `vetta-asset` 是否改名单独评估；它们不是产品深链。
- 插件 `pluginApiVersion`：新 scope 包发布时升兼容范围，旧 `@vetta-org/plugin-sdk` 保留一个废弃版本转发。
- `skills-lock.json`、GitHub Actions 产物名、`Vetta-*.yml` 更新 feed 文件名改为 `Origin-*`（第一阶段安装包已用 Origin 文件名；CI 脚本里剩余 `Vetta` 字面量在本步清掉）。

```bash
node scripts/rename/rename-internal-identifiers.mjs --step ci-sdk --dry-run
```

### 5. 下线 `vetta://`

在第二阶段发布至少一个大版本、服务端回调切到 `origin://` 并公告后，从 electron-builder `protocols.schemes` 与 Windows 注册表中移除 `vetta`。

## 每步验证

| 步骤 | 验证 |
| --- | --- |
| npm-scope | `bun install`、`bun run check`、`bun run test:changed` |
| data-dir | 单元测试覆盖「仅旧目录 / 仅新目录 / 两者都在」；开发态 `dev:home` 仍能读旧凭据直到运行时名迁移完成 |
| ipc | desktop IPC 合同测试、preload 类型 |
| ci-sdk | packaging 合同测试、plugin-sdk 版本矩阵 |
| 全量 | `bun run check` |

## 执行窗口

其它线程停止向 `@vetta/*` 新增代码后再跑写操作。建议顺序：先 npm-scope（锁文件一次重生），再 data-dir + runtime name，再 IPC，最后 CI/SDK 与 scheme 下线。
