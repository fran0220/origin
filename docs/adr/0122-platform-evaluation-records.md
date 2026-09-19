# ADR-0122：平台级 Evaluation 五记录模型

## 状态

已接受

## 背景

Game Studio 与其它产品面需要一套「工作是否达标」的产品记录，而不是模型自述。现有 `runtime-telemetry` 的 trace 只能证明某次调用发生过；bash 结果只作为对话 JSONL 里的 toolResult。Sophon 的 Evaluation crate 已经把 Definition / Attempt / Evidence / Finding / Outcome 五记录与聚合规则定下来，本仓库需要按 TypeScript 与现有 runtime 账本约定重写，而不是把评估逻辑散落在 Desktop UI 或 Agent 工具里。

并行线程正在落地 Checkpoint 收据与 Recording。Evaluation 必须先定义证据端口，再以适配器接入这些来源；来源未推送时适配器返回空集，不能阻塞评估账本本身。

## 决策

1. 新增平台中立包 `@vetta/runtime-evaluation`，只描述五记录模型、TypeBox schema（`recordType` + `schemaVersion`，current-write / compatible-read）、纯聚合规则、指纹去重与端口。生产源码不导入 `node:*`、Electron 或其它 runtime 实现。
2. Attempt 不可变。`inputFingerprint = sha256(scope, definition, trigger, evidenceIds)`；相同指纹复用已有 Attempt，但 `cancelled` / `budget-limited` 不参与复用。证据超过 256 条记为 `budget-limited`。
3. 聚合：全部 required 通过才 `passed`；任一 required `failed` → `failed`；缺证据或缺 finding → `inconclusive`；required verifier 崩溃 → `error`。可选 criterion 不影响 Outcome。模型自述只能进入 `Finding.note`，不是 Evidence。
4. Node 文件账本、命令型 verifier 与默认证据适配器放在 `@vetta/runtime-node/evaluation`：`<accountPartition>/evaluation/<scopeKey>/definitions.jsonl`、`attempts.jsonl`、`evidence/<id>.json`。Desktop 通过 `resolveAccountScopedDir(..., "evaluation")` 解析分区（登录账号进 `accounts/<hash>/evaluation`，未登录进 `logged-out/evaluation`），既有 `<agentDir>/evaluation` 会迁入当前分区。IPC `vetta:evaluation:*` 暴露 list/upsert/run/get/cancel，并提供全页 `/evaluation`。
5. Coding Agent 在宿主注入 `evaluationRuntime` 时注册 `evaluation_run` / `evaluation_list` / `evaluation_get`。Plugin API 2.6.0 增加 `ctx.evaluation` 与权限 `evaluation:run` / `evaluation:read`。
6. 证据 kind 固定为 `execution-receipt` | `checkpoint` | `recording` | `trace` | `artifact`。Recording 的 ref 形状先作为合同；默认 provider 在 recording 包落地前返回空集。

## 备选方案

- 把评估结果写进对话 JSONL：无法跨会话复用，也无法把证据与 criterion 对齐，且会被压缩策略改写。
- 只做 UI 对 trace 的展示：缺少 Definition 修订、指纹去重与不可变 Attempt，无法作为产品记录。
- 让模型直接判定通过：与「模型自述不是证据」冲突，也无法对接命令型 verifier。

## 后果

Desktop 侧栏出现评估页；Agent 与插件可以触发同一套账本。Checkpoint / Recording 未落地时，对应证据为空，命令型 verifier 仍可产出 execution-receipt。新增权限要求插件声明 `pluginApiVersion ^2.6.0`。若本机已有未分区的 `<agentDir>/evaluation`，首次打开会迁入当前账号分区，不丢数据。
