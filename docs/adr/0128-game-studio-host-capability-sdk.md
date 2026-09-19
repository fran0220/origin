# ADR-0128：Game Studio 通过受权限保护的 SDK 接入宿主评估、录像与项目身份

## 状态

已接受

## 背景

Origin Game Studio 需要把「创建项目 → 脚手架运行 → 录制/探针 → 里程碑评估 → checkpoint 引用 → 录像列表」做成真实路径。临时适配层用类型强转伪造 `evaluation.upsertDefinition`，run/revert/recording 返回值与平台合同不一致，`plugin.json` 也未声明对应权限。项目键不能由插件自己 hash。

## 决策

1. Plugin API 升到 2.8.0。新增权限 `evaluation:write`，门控 `ctx.evaluation.upsertDefinition({ definition, scope })`。command verifier 为 `{ kind: "command", command, args?, cwd? }`；遥测断言为 `{ kind: "assertion", source: "recording-telemetry", expression }`，expression 是受限 JSON 字符串。
2. 新增 `ctx.project.resolve(cwd)`（`workspace.read`）。返回宿主 `CapabilityProjectDescriptor`：`evaluationScope`、`checkpointProjectKey`、`recordingProjectKey`。IPC 通道 `vetta:project:resolve` 只做绝对路径校验后委托 `resolveDesktopCapabilityProject`。插件不得自己计算存储键。
3. Game Studio preset 声明 `evaluation:run/read/write`、`checkpoints:read/revert`、`recording:capture`、`workspace.read`，`pluginApiVersion` 为 `^2.8.0`。探针在活跃录像上走 `ctx.recording.probe`，否则回落 `capture.offscreen`。`record` 固定 `tick → input → advance` 取样。节点激活不再发 recording-telemetry。文件回退使用宿主检查点入口，不另造插件工具。

## 备选方案

- 继续在插件内伪造 host bag：会再次偏离 SDK 合同，且绕过权限。
- 插件自己 hash cwd：与 Evaluation hash16 / Checkpoint base64url / Recording 调用方键冲突，无法兼容既有账本。
- 把 upsert 并进 `evaluation:run`：写入 Definition 与启动 Attempt 的风险面不同，不能混权。

## 后果

仓库外插件作者必须为写入评估标准和解析项目键声明 Plugin API `^2.8.0`。旧宿主 fail-closed 给出不支持版本，而不是静默丢掉权限。Game Studio 不再维护临时 host adapter 形状。项目身份解析实现仍由独立身份模块拥有。
