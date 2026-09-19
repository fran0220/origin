# Origin 内部标识符迁移计划（第二阶段）

第一阶段已把用户可见产品名改为 Origin，并双注册 `origin://` / `vetta://`。
第二阶段写盘已由 `scripts/rename/apply-origin-identifiers.mjs` 执行，**不再保留旧路径或旧环境变量回落**。

扫描器 `scripts/rename/rename-internal-identifiers.mjs` 仍可 `--dry-run` 核对残留。
写盘用：

```bash
node scripts/rename/apply-origin-identifiers.mjs --dry-run --step all
node scripts/rename/apply-origin-identifiers.mjs --apply --step <npm-scope|data-dir|ipc|identity|agent-profiles|remaining>
```

## 已执行

| 步骤 | 结果 |
| --- | --- |
| npm-scope | `@vetta/*` → `@origin/*`，`@vetta-org/*` → `@origin-org/*`，`bun.lock` 已重生 |
| data-dir | `~/.vetta` / 项目 `.vetta` → `.origin`；`VETTA_*` → `ORIGIN_*`；无旧变量回落 |
| ipc | 通道 `vetta:` → `origin:`；preload `window.originApp`（避免撞 `window.origin`）；不双暴露旧名 |
| identity | `APP_RUNTIME_NAME` / `APP_NAME` → `origin`；`vetta-file` / `vetta-media` → `origin-file` / `origin-media` |
| agent-profiles | `packages/agent-team` → `packages/agent-profile`；Desktop `agent-teams` 目录与 IPC 改为 agent-profiles |
| remaining | 插件 id `origin-actions` / `origin-ui-design`、CLI bin `origin`、`origin-plugin` 等 |

## 刻意不改

- 历史 ADR 当时用词
- 服务端仓库名 `vetta-serv`
- 远程 provider id `vetta-go`
- 登录深链 `vetta://`（与 `origin://` 并存）
- Go module `vetta-im-gateway`
- Kotlin 包路径 `org.vetta.*`
- 外置插件 id `cowart-vetta`
- GitHub 组织/仓库 `openvetta` / `open-vetta`
- 设计文件格式 `.vetd` / `VETD_*`

## 回滚

未 push 前 `git revert` 对应提交。已发布的内部运行时名、数据目录和 IPC 通道没有兼容窗口。
