# ADR-0121：Game Studio 以系统预置插件 `origin-game-studio` 进入 Origin

## 状态

Accepted

## 背景

Sophon 的 Game Studio 是一套完整的「导演一款可玩游戏」产品：一行想法、八张类型卡片、设计图、canvas2d/three 脚手架、舞台探针、里程碑核验与交付。open-vetta 要用 Origin 取代 Sophon，且 Game Studio 依赖的 Checkpoint / Evaluation / Recording 由并行线程做成平台能力，不能写进插件私有逻辑。

同构范本是 `vetta-ui-design`（Sophon Design Studio 的 Vetta 形态，ADR-0053/0054/0058/0114）：清单声明人格与 skill，运行时用 `registerTool`、`registerWorkspaceView`、`registerActivityTab`、`registerCardRenderer`、`registerNewSessionContext`，长驻进程走 `ctx.command.spawn({allocatePort:true})`，离屏读回走 `capture.offscreen`。

## 决策

1. Game Studio 作为系统预置插件 `packages/plugins/presets/origin-game-studio` 发布，插件 id、目录名与产品文案一律用 **Origin**，不沿用 `vetta-game-studio`。
2. `plugin.json` 用当前 Plugin API `^2.0.0`。`agent.agents` 注册 `game-director`；`agent.skillPaths` 迁入 Sophon 的 10 个中性 skill 以及 canvas2d/three 基板 skill；`agent.mcpServers` 声明远程 `origin-assets` / `origin-examples` / `origin-game-knowledge`，URL 来自 Sophon 部署，允许配置覆盖。
3. Sophon `tools.rs` 的约 30 个工具全部用 TypeBox 输入 schema 实现，按 stage / design / build / deliver 分组；另加 Origin 侧 `create_project`、`start_dev_server`、`probe_*` 以便在平台能力未齐时也能走通「想法 → 脚手架 → 舞台」。
4. 脚手架从 `assets/game-scaffold/{shared,canvas2d,three}` 原样迁入插件资产。`create_project` 复制模板并注入项目名。dev server 用 `ctx.command.spawn({allocatePort:true})` 启动 Vite，args 带 `--strictPort`，端口占用时重试；会话结束（`SessionEnd` hook）停止进程。
5. 探针沿用脚手架 `__runtime_probe__`，并在 `shared/src/core/probe-bridge.ts` 提供 iframe/postMessage RPC。工具经 `capture.offscreen` 的 `probeScript`/`prepareScript` 通话。Recording 线程若已挂上 `ctx.recording`，适配层识别它但暂不改协议，避免猜测未落地的 RPC。
6. 里程碑用 Evaluation `Definition` 形状表达，由插件存储持久化。`ctx.evaluation` / `ctx.checkpoints` / `ctx.recording` 尚未进入 plugin-sdk，插件只通过 `src/adapters/host-capabilities.ts` 的窄端口对接；并行线程落地后在该文件接入，不改工具语义。
7. 不把 Checkpoint / Evaluation / Recording 实现放进本插件，也不改并行线程正在新增的 `packages/runtime-*` 包。

## 备选方案

| 方案 | 未采纳原因 |
| --- | --- |
| 做成 Desktop 内置页而不是插件 | 破坏与 Design Studio 的同构，也无法用清单声明人格、skill 与 MCP |
| 等 Recording/Evaluation SDK 完成后再迁工具 | 舞台与脚手架会空转一个版本，用户流程无法验证 |
| 最小占位：只注册人格和空 UI | 用户明确要求完整方案；空工具无法落地脚手架或探针 |

## 后果

- 用户在新会话选择游戏导演即可创建游戏项目，无需安装插件。
- Recording / Evaluation / Checkpoint 未落地期间，对应工具与录像面板给出真实空态或明确拒绝，不发明假数据。
- 远程 MCP 需要用户侧 Connection 真正配置成功才会挂上；清单声明不等于已经连上。
- 脚手架锁定 Bun 1.4 / Vite 8 / TypeScript 7.0.2，与 Sophon 一致；宿主若没有 `bun` 可执行文件，`commands` 声明会让启动失败并提示用户。
