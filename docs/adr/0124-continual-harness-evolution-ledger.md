# ADR-0124：平台级 Continual Harness Evolution 账本

## 状态

已接受

## 背景

Agent 在多 Turn、多会话工作中会沉淀出应被后续 Turn 遵守的规则：构建不变量、约定、能力路由备注。现有 Memory 是可变 Markdown 事实层，运行时构造时冻结快照，不适合作为带版本、可回滚、可提升的规则账本。Sophon 的 Evolution / continual-harness 用两级 append-only 事件链表达这些规则；本仓库需要同等语义，但按 TypeScript 与现有 Runtime 包边界重写。

Turn 准入已经冻结 Prompt、Skill 和 Memory 快照（见 ADR-0069 的 generation/snapshot 冻结语义）。Harness 必须走同一条准入路径：当前 Turn 的 refine 不得改写本 Turn 的 system prompt。

## 决策

1. 新增平台中立包 `@vetta/runtime-evolution`。账本恰好两级：`{kind:"global"}` 与 `{kind:"subject", subjectId}`。`subjectId` 为已登记 Project 的 path，或 Home 对话的 `"home"`。
2. 账本是每 scope 一条 append-only 事件链。事件带 `vetta.evolution.refinement-event.v1` 域的 SHA-256 digest、`parentDigest` 与单调 `revision`。`commit(expectedRevision)` 做 CAS；冲突返回 `RevisionConflict`，不隐式合并。`Unsettled` 表示无法确认是否落盘；`NotReversible` 表示目标事件已不再能整条撤回。
3. rollback 是反向应用某条已 Applied 历史事件的**新事件**，不是改写历史。promote 是把 subject 条目复制到 Global 的独立事件，`source` 为 `promote:${subjectId}`，原 subject 仍保留副本。
4. 预算：每 scope ≤256 条 / ≤192 KB 渲染；单条 content ≤64 KB；历史深度 64；提示词只渲染最近 5 条事件摘要。渲染函数是纯函数，输出确定性的 `<continual_harness>…</continual_harness>`。
5. Node 实现放 `@vetta/runtime-node`：JSONL 文件为 `global.jsonl` 与 `subjects/<subjectId>.jsonl`，文件锁 + expectedRevision CAS，原子追加。根目录由宿主解析为账号分区下的 `evolution/`（已登录 `accounts/<sha256(scope)>/evolution`，未登录 `logged-out/evolution`），不再直接写 `<agentDir>/evolution`。既有未分区目录由 Desktop `migrateUnscopedLegacyTrees` 迁入当前分区。
6. Coding Agent 提供 `harness_refine` / `harness_list` / `harness_rollback` / `harness_promote`。origin 取自 `sessionId` / `turnId` / `toolCallId`；subject 由组合层注入。`kind: skill/subagent` 只是提示词级引导，不自动注册能力。Harness 与 Memory 并存，不合并、不重复存事实。
7. Prompt 注入在 `bindForTurn` 捕获两级账本的不可变投影，渲染为 `core.harness` 块，优先级 650（memory 与 skills 之间）。本 Turn refine 只对下一 Turn 可见。
8. Desktop 通过 IPC `evolution.read/commit/rollback/promote/history` 暴露账本。设置页 `/settings/harness` 编辑 Global；项目详情页编辑该 Project 的 subject 账本，支持 `source:"host"` 的人工编辑、rollback 与 promote。CLI 与 SDK 使用同一 ledger；CLI 没有项目登记表，subject 为会话 cwd，cwd 为空时才是 `home`。

## 备选方案

- 把规则写进 Memory Markdown：实现最短，但没有 revision、CAS、整条 rollback 或 Global/subject 分层，也无法在设置页做人工编辑而不破坏 Memory 的事实语义。
- 把账本放进 coding-agent：Desktop 设置页和 CLI 都会反向依赖产品组合层；规则层应属于 Runtime 能力域。
- 提交时隐式合并冲突：用户与 Agent 同时 refine 时看起来“成功”，实际丢掉一方的意图。CAS 拒绝更诚实。
- 本 Turn 立即把 refine 写进 system prompt：破坏 prompt cache 与 ADR-0069 的 Turn 准入冻结。

## 后果

后续 Turn 能稳定读到经过校验的规则层，且与 Memory 事实层分开。新增包、IPC、设置页和四个 Agent 工具；旧会话在没有 harness 条目时行为不变。skill/subagent 条目不会注册新工具。账本文件是 append-only JSONL，迁移只需兼容读取旧 `schemaVersion`。
