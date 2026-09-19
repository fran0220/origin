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

## 后续落实：真实平台证据与账号固定目录

Checkpoint / Recording 已落地后，Desktop 的 `platform-evidence.ts` 替换三个空查询，读取真实文件账本。项目身份由宿主解析，兼容各能力的历史存储键；Home 与未知项目不能互相回退。Turn / Checkpoint 触发按轮次筛选收据，并仅在同会话时间区间可证明时引用录像；手动或里程碑触发捕获同项目已完成、未过期的录像，不预先挑最新一条。手动引用精确命中录像 ID 时选择该条，否则由 verifier 对唯一录像求值，多条录像保持 inconclusive。

检查点和录像不是天然不可变的证据：检查点会经历验证或回退，录像遥测文件也可能变化。因此证据 ID 加入内容 digest，历史 Attempt 引用的摘要不会被同 ID 的后续状态覆盖；录像 verifier 必须核对读取内容与捕获时 digest 相同，不接受悄悄更新证据。

EvaluationService 以创建时的账号目录固定全部账本与证据根目录，不再每次文件写入时重新解析登录态。宿主收到新账号的评估调用时取消旧实例，Agent 长期持有的 operations 在每次调用入口解析当前实例；已在途的运行仍只写回原账号。这样既不让新调用滞留旧账号，也不让一次运行跨账号落盘。
