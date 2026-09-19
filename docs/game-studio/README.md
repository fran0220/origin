# Game Studio 与平台底层能力设计

> 状态：**已进入实施与跨能力整合**。Game Studio、Checkpoint、Evaluation、Evolution 与 Recording 已有实现，不能再把本文的迁移前缺口当作当前状态。本文保留设计背景与验收范围；当前合同以源码、测试及 ADR-0121～0128 为准，代码存在不代表所有真实宿主流程已经验收。

## 1. 目标与边界

- 用 Origin 取代 Sophon。Game Studio 以**系统预置插件**形态进入（`packages/plugins/presets/origin-game-studio`，ADR-0121），与 `vetta-ui-design`（Sophon Design Studio 的 Origin 形态，ADR-0053/0054/0058）同构。用户指南见 [user-guide.md](./user-guide.md)。
- Game Studio 依赖的三项能力不是插件私有逻辑，而是**平台底层能力**，任何 Studio、CLI、IM 宿主都能复用：
  1. **Checkpoint**：每个 Turn 结束后的文件快照 + 验证 + 保留/回退，崩溃可恢复，历史不改写。
  2. **Evaluation + Evolution**：五记录评估模型（证据只来自产品记录与真实 verifier）；两级 continual-harness 账本（Global + subject），Agent 用工具沉淀规则，下一 Turn 准入时渲染进 system prompt。
  3. **Recording**：带时间戳的网页录制 → MP4 + 抽帧 + 遥测/输入脚本 + 保留期 + 多模态模型审阅。
- 不迁移 Sophon 的原生 wgpu 目标；Web 目标（`canvas2d` / `three`）通过 Vite dev server + 离屏页面运行。

## 2. 迁移前核查基线（历史背景，不是当前缺口列表）

对应实现现已分别位于 `runtime-checkpoints`、`runtime-evaluation`、`runtime-evolution`、`runtime-recording`，Node 适配位于 `runtime-node`。插件已通过 SDK 写入评估定义、录制页面及查询检查点；宿主统一解析项目身份，评估读取真实收据、检查点与录制遥测。遥测断言使用受限 JSON，缺数据不会判为通过；验收项见第 9 节。

| 能力 | 已有可复用 | 缺口 |
| --- | --- | --- |
| 会话回退 | `kernel-runtime-session-backend.ts` navigateForEdit/switchBranch/forkSession；`file-conversation-repository.ts` writeFork | 只回退对话，不回退文件 |
| 文件快照 | 仅示例扩展 `coding-agent/examples/extensions/git-checkpoint.ts`（内存 stash） | 无生产实现、无持久化、无验证、无崩溃恢复 |
| 执行凭据 | `NodeHostBashExecutor` 返回结构化 exitCode | 对话记录 `toolResult` 无 exitCode；无独立、可引用的 Execution Receipt |
| Git UI | `plugins/presets/git`：status/diff/log/graph 及 `graphLayout.ts`、`GitGraphCanvas.tsx` | 无 commit/revert；无 Timeline 语义 |
| 记忆 | `coding-agent/src/memory/*`：可变 Markdown、runtime 构造时冻结快照、模型抽取事实 | 非 append-only、无版本/CAS/rollback/promote、无两级 scope、证据非真实 |
| 评估 | `runtime-telemetry` trace（白名单、7d/5000/16MiB）；`vetta-blog/validate-blog.mjs` 局部门禁 | 无 Definition/Attempt/Evidence/Finding/Outcome 任何记录 |
| Prompt 合成 | `system-prompt-policy.ts:359–419` 优先级块；`prompt-snapshot.ts` 准入冻结；plugin `registerSystemPromptProvider` | 缺一个"准入时捕获账本 revision → 渲染 `<continual_harness>`" 的 provider |
| 浏览器 | 外部 `agent-browser` CLI（Agent 自有 session）；`ctx.browser` Foundation Capability | 无 screencast / MediaRecorder / 录像文件链路 |
| 离屏抓帧 | `offscreen-capture-service.ts`：隐藏 OSR `BrowserWindow` + `capturePage`，仅 http(s) | 单帧、无时间轴、无音频、无编码、不接受 `file:` |
| 媒体作业 | `JobManager`、`ArtifactStore`（tmp + 内存索引）、`ctx.media` transcode 协议 | 无 ffmpeg（既非打包也非 managed runtime）；artifact 无到期策略、无重启后回收 |
| 多模态输入 | `packages/ai` `ImageContent`；Gemini `inlineData` 映射 | 无 `VideoContent`/文件引用 part；`ModelInputCapability` 有 `"video"` 标签但无实现 |
| 子进程 | `ctx.command.spawn` + `allocatePort` + 进程树清理，随插件卸载停止 | 无按 Agent session / Recording session 的所有权 |

## 3. 总体架构

```diagram
┌──────────────────────────────────────────────────────────────────────┐
│ apps/desktop                                                         │
│  Timeline 页  Evaluation 页  Harness 设置页  Recording 面板          │
│  IPC: checkpoints / evaluation / evolution / recording               │
│  main: shadow-git 执行、ffmpeg runtime、OSR 录制引擎、Job/Artifact   │
└───────────────┬──────────────────────────────────────────────────────┘
                │ 公开 exports（禁止 deep import）
┌───────────────▼──────────────┐  ┌──────────────────────────────────┐
│ packages/plugins/presets/    │  │ packages/coding-agent            │
│   origin-game-studio         │  │  harness tools / prompt provider │
│   (Studio 产品组合)          │  │  checkpoint turn hook            │
└───────────────┬──────────────┘  └───────────┬──────────────────────┘
                │ plugin-sdk: ctx.recording / ctx.checkpoints / ctx.evaluation
┌───────────────▼─────────────────────────────▼──────────────────────┐
│ packages/runtime-checkpoints  runtime-evaluation  runtime-evolution │
│ packages/runtime-recording (平台中立领域 + 端口 + TypeBox schema)   │
└───────────────┬────────────────────────────────────────────────────┘
                │ Node 实现（git、文件账本、ffmpeg、子进程）
┌───────────────▼────────────────────────────────────────────────────┐
│ packages/runtime-node  (checkpoints/, evolution/, recording/)       │
│ packages/runtime-storage (record schema 模式)  packages/ai (Video)  │
└────────────────────────────────────────────────────────────────────┘
```

依赖方向遵守 `scripts/quality/check-package-boundaries.mjs`：新增四个 `runtime-*` 包加入 `LIB_PREFIXES`；它们只依赖 `runtime-core`/`runtime-storage`/TypeBox；Node I/O 实现放 `runtime-node`；Desktop 只做装配、IPC 与 UI。

持久化位置统一在**应用数据目录**（`getAgentDir()`），按 Project 键分目录，**不写入用户工作树**：写进 `<cwd>/.vetta/` 会让快照提交把自己的日志纳入版本历史，也会污染用户仓库。

```text
<agentDir>/
  accounts/<accountHash>/    # 已登录；未登录使用 logged-out/
    checkpoints/<projectStorageKey>/  mainline.jsonl receipts.jsonl shadow.git/
    evaluation/<scopeKey>/            definitions.jsonl attempts.jsonl evidence/<id>.json
    evolution/                       global.jsonl subjects/<subjectId>.jsonl
    recordings/<projectKey>/         <recordingId>/video.mp4 telemetry.jsonl input.jsonl record.json
```

现有 Project 以路径标识，没有独立 Project id。宿主 `projects/capability-project.ts` 统一解析项目描述符：Evaluation 使用历史 SHA-256 前 16 位，Recording 新写键与其一致，Checkpoint 保留可反解路径的 base64url 合同。查询兼容旧 Game Studio 的 24 位哈希；存量账本不靠全盘重命名统一。Home 的 Evaluation scope 为 `global`，Checkpoint / Recording 键为 `home`，未知项目不能回退到 Home。插件应使用宿主提供的描述符，不自行计算这些键。

## 4. Checkpoint（`packages/runtime-checkpoints`）

### 4.1 领域模型（TypeBox，`recordType: "checkpoint.mainline"`, `schemaVersion: 1`）

```ts
MainlineCheckpoint {
  id; operationId; projectKey; sessionId; turnId; intent;
  createdAt;
  verification: VerificationStep[];      // { command, cwd, state: Queued | Running{executionId} | Settled{executionId, outcome} }
  phase: "verifying" | "reverting" | "settled" | "failed";
  decision?: "kept" | "reverted";
  landed?: { commit; parent; paths; added; removed };  // shadow repo 提交
  revertOperationId?; revertedBy?; error?;
}
VerificationOutcome = Exited{code} | Signalled{signal} | Cancelled | TimedOut | Interrupted | FailedToStart | Unknown
// 只有 Exited{0} 视为通过
ExecutionReceipt { executionId; sessionId; turnId; toolCallId?; command; cwd; startedAt; endedAt; outcome }
```

### 4.2 快照策略：shadow repo（默认）与 project mainline（可选）

- **默认 shadow repo**：`GIT_DIR=<accountPartition>/checkpoints/<projectStorageKey>/shadow.git`、`GIT_WORK_TREE=<cwd>`，遵守用户 `.gitignore`，另加 `.vetta/` 与 `node_modules/` 排除。用户仓库历史零改动；非 git 目录同样可用。
- **project mainline 模式**：由 Project 策略显式开启，直接提交到项目当前分支。当前平台默认均为 shadow，包括 Game Studio 项目，不因插件创建了目录就自动改用户仓库历史。
- **回退 = 新提交**（restore 文件后再 commit），永不改写历史。Timeline 用 `feedback` 边连接 revert → 被回退的 checkpoint。
- 对话回退与文件回退是两个动作，UI 先预览再执行，不声称原子。

### 4.3 生命周期与崩溃恢复

1. `turn.completed`（`turn-pipeline.ts:625–694`）后由 coding-agent 的 `CheckpointTurnFeature` 提交意图：`propose({sessionId, turnId, intent, verification})`。
2. Reactor 读取 durable 记录，按 phase 推进：`Land`（shadow commit）→ `Verify`（逐条执行、写 Receipt）→ `Settle`（全部 Exited{0} → kept；否则策略决定 auto-revert 或留给用户）。
3. 每个 effect 先写"意图"记录再执行，成功后写"结果"记录（模式同 `team-publication-workflow.ts` prepared→recover）。进程重启时 Reactor 扫描 `verifying/reverting` 记录续跑，`Running` 但无 receipt 的验证记为 `Interrupted`。
4. `ExecutionReceipt` 由 `runtime-node` 的命令执行器统一产出（bash 工具与验证命令共用），对话 `toolResult` 记录新增可选 `executionId` 字段以建立引用（record schema 兼容读）。

### 4.4 宿主接口

- 内核端口：`CheckpointStore`、`WorkTreeVcs`（`land`/`restore`/`diff`）、`VerificationRunner`。
- Desktop IPC：`checkpoints.list/get/revert/rerunVerification/setPolicy`；Timeline 页复用 `git` preset 的 `graphLayout.ts` 与 `GitGraphCanvas.tsx`（抽到 `packages/ui` 或 preset 公共入口后共享，不 deep import）。
- plugin-sdk `ctx.checkpoints`（只读 + 请求 revert，需权限 `checkpoints:read` / `checkpoints:revert`）。

## 5. Evaluation（`packages/runtime-evaluation`）

### 5.1 五记录合同

```ts
Definition { id; revision; title; criteria: { id; title; required; verifier?: VerifierRef }[] }
Attempt    { id; scope: {kind:"global"} | {kind:"project", projectKey}; definitionId; definitionRevision;
             trigger: {kind:"turn"|"checkpoint"|"milestone"|"manual"; ref}; inputFingerprint; // sha256(scope, definition, trigger, evidenceIds)
             evidenceIds: string[] /* ≤256 */; findings: Finding[]; outcome: Outcome; createdAt }
Evidence   { id; source: {kind:"execution-receipt"|"checkpoint"|"recording"|"trace"|"artifact"; ref}; capturedAt; digest; summary }
Finding    { criterionId; state:"passed"|"failed"|"inconclusive"|"error"; evidenceIds; note? }
Outcome    { kind:"passed"|"failed"|"inconclusive"|"error"|"cancelled"|"budget-limited"; settledAt }
```

- 全部 `required` 通过才 `passed`；任一 required failed → `failed`；缺证据/缺 finding → `inconclusive`；verifier 崩溃 → `error`。
- Attempt 写入后不可变；重跑产生新 Attempt。`inputFingerprint` 相同可去重。
- 证据只能来自四类真实来源：Execution Receipt、Checkpoint landed/verification、Recording（帧/遥测/视频摘要）、Artifact digest。**模型自述不是证据**；模型审阅（如 Gemini review_video）的输出只能作为 Finding 的 `note`，其引用的证据仍是录像本身。
- `EvaluationEvidenceProvider.capture(scopeKey, trigger)` 由各 surface 实现（Checkpoint、Recording、Game Studio milestone）。
- Desktop 按项目与触发上下文读取收据和检查点。手动或里程碑评估默认选择同项目最新的已完成、未过期录像；`manual.ref` 可精确指定录像 ID。Turn / Checkpoint 评估仅在收据能证明同会话、同时间区间时附加录像，不用其他轮次的视频补足证据。
- 检查点证据 ID 包含记录摘要，录像证据 ID 包含遥测内容 SHA-256，防止状态改变后复用旧评估。录像 verifier 校验实际文件 digest；缺失数据为 `inconclusive`，条件不满足为 `failed`，格式非法或内容发生变化为 `error`。

### 5.2 宿主接口

- Desktop 内置页 `/evaluation`（参照 `BatchTasksPage.tsx`；接入 `router.tsx`、`persistent-surface.ts`、`PersistentRouteStage.tsx`、侧栏、i18n）。
- IPC：`evaluation.listDefinitions/upsertDefinition/listAttempts/run/cancel`。
- plugin-sdk `ctx.evaluation.run({definitionId, trigger})`、`registerEvidenceProvider`。

## 6. Evolution / continual-harness（`packages/runtime-evolution`）

### 6.1 账本模型

```ts
Scope = {kind:"global"} | {kind:"subject", subjectId}   // subjectId: projectKey 或 "home"，恰好两级
HarnessEntry { id; kind:"prompt"|"memory"|"skill"|"subagent"; title; content; skill?; source:"refine"|"host"|`promote:${subjectId}`; version; createdAtMs; updatedAtMs }
RefinementProposal { summary; rationale; expectedOutcome; edits: Edit[] /* ≤32 */ }
Edit = {action:"create", entry} | {action:"update", id, expectedVersion, patch} | {action:"delete", id, expectedVersion}
RefinementEvent { digest /* sha256, domain "vetta.evolution.refinement-event.v1" */; parentDigest; scope; revision; proposal; applied: Edit[]; rejected: {edit, reason}[]; origin:{sessionId, turnId, toolCallId}; createdAtMs }
```

- 每个 scope 一条 append-only 事件链，`revision` 单调递增；`commit(expectedRevision)` 做 CAS，冲突返回 `RevisionConflict`，不做隐式合并。
- rollback：以新事件反向应用某个历史事件（`NotReversible` 时拒绝）。promote：把 subject 条目复制到 Global（新事件，source 标记来源）。
- 预算：每 scope ≤256 条 / ≤192 KB 渲染；单条 content ≤64 KB；历史深度 64，渲染最近 5 条事件摘要。
- `kind: skill / subagent` 的条目在 MVP 里是**提示词级别**的引导（告诉 Agent 何时用哪个 skill/subagent），不自动注册新能力；真正注册能力需走 skill-presets / runtime-subagents 现有路径。

### 6.2 Agent 工具与 Prompt 注入

- 工具（沿 `memory-tool.ts` 模式放在 coding-agent）：`harness_refine`、`harness_list`、`harness_rollback`、`harness_promote`。工具从 `RuntimeToolExecutionRequest` 取 `sessionId/turnId/toolCallId`，subject 由组合层注入。
- Prompt provider：在 `capability-session-assembly.ts:412–417` 的准入路径捕获两级账本的不可变投影（revision 固定），渲染成 `core.harness` 块，优先级 650（memory 600 与 skills 700 之间），包裹于 `<continual_harness>…</continual_harness>`。当前 Turn 内的 refine 不影响当前 Turn 快照，下一 Turn 才可见（与 ADR-0069 冻结语义一致）。
- 与现有 Memory 的关系：Memory 继续存在（Claw/IM 的连续记忆），Harness 是规则层；两者内容分离，Harness 不重复存事实。

### 6.3 宿主接口

- Desktop：`/settings/harness`（Global）与 Project 设置内的 subject 视图；支持人工编辑、rollback、promote。
- IPC：`evolution.read/commit/rollback/promote/history`。

## 7. Recording（`packages/runtime-recording` + Desktop 引擎）

### 7.1 引擎选型

- **视频**：扩展现有离屏能力，`BrowserWindow({webPreferences:{offscreen:true}})` + `webContents.setFrameRate(30)` + `paint` 事件获取带时间戳的 NativeImage 帧流；不依赖 CDP `Page.startScreenRecording`（本仓库未验证其可用性，且 agent-browser 驱动的是外部 Chrome）。
- **编码**：ffmpeg 作为**新增 managed runtime**（`RuntimeType` 加 `"ffmpeg"`，按平台下载固定版本静态构建并校验 sha256，沿 ADR-0011 的内置/下载/系统探测三级策略）。帧流通过 stdin rawvideo 喂给 ffmpeg，默认输出 **H.264 + AAC MP4**（多模态模型与系统播放器兼容性最好），可选 AV1。
- **音频**：向离屏页面注入 preload，把页面 `AudioContext` 目标接到 `MediaStreamAudioDestinationNode`，用 `MediaRecorder(audio/webm;codecs=opus)` 分段回传主进程，最终由 ffmpeg mux。无音频源时产出无声 MP4，记录里标注 `audio: "none"`。
- **遥测/输入**：Probe（iframe postMessage RPC：tick/state/advance/input/pick/read_entity/patch_entity）产生的事件与注入的输入脚本以同一单调时钟写入 `telemetry.jsonl` / `input.jsonl`。
- `file:` URL：离屏窗口允许 `file:` 仅当路径在 Project cwd 内；其余仍只允许 http(s)。

### 7.2 记录与保留

```ts
RecordingRecord { id; projectKey; sessionId; startedAt; endedAt; durationMs; video: {path; mimeType; codec; width; height; fps; sizeBytes}; audio: "none"|"opus-muxed";
                  frames: {atMs; path}[]; telemetryPath; inputPath; retention: "30m"|"2h"|"until-cleared"; expiresAt?; status:"recording"|"finalizing"|"ready"|"failed" }
```

- 保留期索引持久化在 `recordings/<projectKey>/index.json`；启动时扫描清理过期与孤儿目录（修复 ArtifactStore 现有"按 PID 的 tmp 目录不回收"缺口，但不改变 ArtifactStore 的临时语义）。
- 操作：`start/stop/cancel/list/read/sample/clear`；`sample({atMs[] | everyMs, contactSheet?})` 用 ffmpeg 抽 PNG 帧并可生成 contact sheet。

### 7.3 多模态审阅

- `packages/ai`：新增 `VideoContent { type:"video"; mimeType; data?: base64; uri?: string; durationMs? }`，加入 `UserMessage.content` 与 `ToolResultMessage.content` 联合；Gemini 映射为 `inlineData`（≤20 MB）或 Files API 上传后的 `fileData`；其它 Provider 对不支持 part 返回明确错误；`ModelInputCapability` 校验 `"video"`。
- Agent 工具 `review_recording({recordingId, question})`：预算 128 MiB，超出先抽样降码率；调用前做 token 估算合理性检查。

### 7.4 宿主接口

- plugin-sdk `ctx.recording`（权限 `recording:capture`）；Agent 工具 `recording_start/stop/sample/read/review`。
- Desktop Recording 面板（在 Game Studio 的 activity dock 内），全局设置里配置默认保留期与 ffmpeg 来源。

## 8. Game Studio 预置插件（`packages/plugins/presets/origin-game-studio`）

- `agent.agents`：game-director 人格；`agent.skillPaths`：迁移 Sophon `assets/agent/game/skills` 的 10 个 skill；`agent.mcpServers`：远程 `origin-assets` / `origin-examples` / `origin-game-knowledge`。
- 工具（约 30 个，来自 Sophon `crates/sophon-studio-game/src/tools.rs`）按 stage / design / build / deliver 分组，全部 TypeBox 输入。
- `registerWorkspaceView`（Board / Map）、`registerActivityTab`（stage / graph / build / recordings dock）、`registerCardRenderer`、`registerNewSessionContext`（一行想法 + 8 个类型卡片）。
- 脚手架 `canvas2d` / `three` 从 Sophon `assets/game-scaffold/` 迁移；dev server 用 `ctx.command.spawn({allocatePort:true})` 并以 `--strictPort` 重试。
- Studio 里的里程碑用 Evaluation Definition 表达（每个里程碑一份 Definition，criteria 的 verifier 指向 Recording 遥测断言或构建命令），Checkpoint 由平台自动产生，Harness 通过 `harness_refine` 沉淀游戏项目规则。

## 9. 分阶段验收范围（不代表下列所有环境测试均已执行）

| 阶段 | 内容 | 关键验证 |
| --- | --- | --- |
| P0 基础 | Execution Receipt（runtime-node + record schema 兼容字段）；`VideoContent` part 与 Gemini 映射；ffmpeg managed runtime | receipt 合同测试；ai 消息转换测试；runtime 下载/校验测试（mock 网络） |
| P1 Checkpoint | `runtime-checkpoints` 领域 + reactor；shadow git 实现；turn hook；Timeline 页 + IPC | 状态机/恢复测试（模拟崩溃）；临时 git 仓库集成测试；用户流程：一次 Turn → 自动 checkpoint → 验证失败 → 一键回退 |
| P2 Evolution | `runtime-evolution` 账本 + CAS + rollback/promote；harness 工具；prompt provider；设置页 | 事件链 digest/CAS 测试；prompt 快照测试（本 Turn 写入不影响本 Turn）；用户流程：Agent refine → 下一 Turn prompt 含规则 |
| P3 Evaluation | `runtime-evaluation` 五记录 + 聚合规则；证据 provider（receipt/checkpoint）；`/evaluation` 页 | 聚合规则边界测试（required/inconclusive/error）；不可变性测试；用户流程：从 checkpoint 触发一次评估并查看结果 |
| P4 Recording | OSR 帧流 + ffmpeg 编码 + 音频 mux；保留期清理；sample/contact sheet；`review_recording` | 编码链路集成测试（短录制→ffprobe 校验）；保留期清理测试（可控时钟）；用户流程：启动页面 → 录 5s → 抽帧 → 审阅 |
| P5 Game Studio | 预置插件全部工具/视图/skill/脚手架 | 插件合同测试；用户流程：一行想法 → 脚手架 → dev server → 录制 → 里程碑评估 → checkpoint |

## 10. 已采用的约束与验收边界

1. Checkpoint 默认使用 **shadow repo**，不改用户仓库历史；project mainline 必须显式选择。
2. ffmpeg 作为**新增 managed runtime**（下载固定版本，非 npm 依赖）；视频默认 **H.264/AAC**，AV1 可选（Sophon 强制 AV1/Opus）。
3. 持久化统一放 **`getAgentDir()`**，不写 `<cwd>/.vetta/`。
4. Harness 与现有 Memory **并存**，不合并；`kind: skill/subagent` 条目在 MVP 里为提示词级引导。
5. Evaluation 的模型审阅结论只能作为 Finding `note`，不能单独作为证据。
6. 新增四个 `runtime-*` 包 + `packages/ai` 公共类型扩展 + plugin-sdk 三个新能力（需要 Plugin API minor 版本升级）。
7. 真实 Electron OSR、音频、打包运行与真实 Provider 视频审阅需要各自的环境验证；Node 假帧源编码、组件测试或插件 zip 构建不能代替这些结论。服务端 PKCE 仍依赖独立私有服务端实现与部署。
