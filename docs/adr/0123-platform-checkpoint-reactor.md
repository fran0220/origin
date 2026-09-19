# ADR-0123：平台级 Checkpoint 与 Execution Receipt

## 状态

已接受

## 背景

Coding Agent 的每一轮 Turn 都会改工作树，但平台没有可恢复的检查点：验证失败后无法一键回到上一轮文件，崩溃也无法续跑未完成的验证。Sophon 用 shadow git + durable reactor 解决了同一问题；本仓库需要按 TypeScript 与现有 Runtime 分层重写，而不是把 Desktop 或 coding-agent 绑死到 Node git 实现。

对话回退已经存在于会话历史，不能和文件回退绑成一个原子动作。

## 决策

1. 新增平台中立包 `@vetta/runtime-checkpoints`，持有 `MainlineCheckpoint` / `ExecutionReceipt` TypeBox schema、纯状态机和 Reactor。生命周期是 **Land → Verify → Settle**：先落 shadow/project 提交，再跑验证，全部 `Exited{0}` 才 kept；失败默认 `keep-for-user`，也可策略 auto-revert。
2. Reactor 每个 effect 先写意图记录再执行。进程重启扫描 `verifying/reverting`；Running 且无 receipt、runner 也不在跑的验证记为 `Interrupted`。
3. Node 实现放在 `@vetta/runtime-node/checkpoints`：默认 shadow repo（`GIT_DIR=<checkpointRoot>/<projectKey>/shadow.git`，`GIT_WORK_TREE=<cwd>`，遵守 `.gitignore` 并排除 `.vetta/` 与 `node_modules/`）；可选 project-mainline。回退永远是 restore + 新提交。
4. 命令执行路径统一产出 Execution Receipt（append-only JSONL）。对话 `toolResult` 增加可选 `executionId`，兼容读历史记录。
5. coding-agent 的 `CheckpointTurnFeature` 在 `turn.completed` 后 `propose`。验证命令来自 Project 策略，默认空列表则 land 后直接 kept。Feature 只依赖 `CheckpointEngine` 端口。
6. Desktop 拥有 IPC、`/timeline` 全页和崩溃恢复。图布局从 git preset 抽到 `@vetta-org/ui/git-graph`；revert 用 `feedback` 边连回被回退的 checkpoint。
7. plugin-sdk `ctx.checkpoints` 只读 + 请求 revert，权限 `checkpoints:read` / `checkpoints:revert`，Plugin API 2.6.0。
8. 持久化只在账号分区下的 `checkpoints/<projectKey>/`：已登录为 `<agentDir>/accounts/<sha256(scope)>/checkpoints/`，未登录为 `<agentDir>/logged-out/checkpoints/`，由 `resolveAccountScopedDir("checkpoints")` 解析。既有未分区的 `<agentDir>/checkpoints` 由账号目录服务迁入当前分区。Project 没有独立 id 时，projectKey 用项目 path 的 base64url；非项目会话用 `home`。不写入 `<cwd>/.vetta/`。

## 备选方案

- 直接提交到用户仓库：默认会污染用户历史；改为可选 project-mainline。
- 验证通过后再 land：崩溃会丢掉尚未提交的工作树；Land-first 保证总有 restore 点。
- 把 git 实现放进 runtime-checkpoints：会破坏平台中立边界，Node 与未来非 Node 宿主无法替换。
- 对话回退与文件回退做成一个事务：两边生命周期不同，失败语义也无法对齐。

## 后果

Turn 完成后用户能在 Timeline 看到检查点，验证失败后可一键恢复文件并产生新提交。插件可读取时间线并请求回退。旧对话记录没有 `executionId` 仍可读取。Desktop 启动时会扫描已知项目续跑未完成检查点。
