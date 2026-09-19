# Origin Game Studio 用户指南

Origin Game Studio 是随桌面端发布的系统预置插件（`origin-game-studio`，ADR-0121）。它把 Sophon 的 Game Studio 迁到 Origin：一行想法、一张类型卡片、一份设计图、一个正在运行的舞台。

## 创建游戏项目

1. 新开会话，选择 **游戏导演**（`@game-director`）。
2. 在输入框写下一句话想法，例如「一款能走起来的迷宫」。
3. 在下方八张类型卡片里点一张（或不选「还不确定」）。类型只决定先问哪些手感问题，不决定渲染器。
4. 导演会调用 `create_project`：写入 `.origin/opening.json`，在空目录落地 `canvas2d` 或 `three` 脚手架，并持久化里程碑定义。
5. 随后 `start_dev_server` / `launch_stage` 会用宿主分配的端口启动 Vite（`--strictPort`，占用则重试）。进程在会话结束时停止。

已有游戏目录走同一入口，把 `existing` 设为 true：先盘点再问「你想改什么」。

## 工具清单

按舞台 / 设计 / 构建 / 交付分组。全部输入走 TypeBox schema。

### 舞台

| 工具 | 作用 |
| --- | --- |
| `read_stage_content` | 读工作区声明与源码符号 |
| `read_stage_status` | 舞台是否在跑、URL、探针是否就绪 |
| `launch_stage` / `start_dev_server` | 启动 Vite 并打开舞台 |
| `stop_stage` / `stop_dev_server` | 停止开发服务器 |
| `advance_stage` / `probe_advance` | 按注入时钟推进一步数 |
| `probe_state` / `probe_tick` | 读探针状态 / tick |
| `play_input_script` | 回放 `playtests/` 下的脚本 |
| `capture_frame` / `read_stage_frame` | 抓一帧 |
| `pick` / `read_entity` / `patch_entity` | 点选、读实体、改本页参数 |
| `list_annotations` / `update_annotation` | 批注生命周期 |

探针走 iframe `postMessage` RPC（`tick/state/advance/input/pick/read_entity/patch_entity`）。有活跃录像时走 `ctx.recording.probe`，把 tick / input / advance 写进 `telemetry.jsonl`；没有活跃录像时回落到 `capture.offscreen` 的 `probeScript`。存在 `ctx.recording` 但尚未 `start` 时不再失败。

### 设计

| 工具 | 作用 |
| --- | --- |
| `create_project` | 一行想法 + 可选类型/基板，落地脚手架 |
| `clarify` | 结构化提问，不替用户作答 |
| `read_design_schema` / `read_production_brief` | schema 与当前图 |
| `edit_design_graph` | choose/reject/reopen/cut/restore |
| `prepare_production` / `prepare_prototype_image` | 制作输入与原型图计划 |
| `accept_design` | 接受后写入文档；空目录才落地脚手架 |

### 构建

| 工具 | 作用 |
| --- | --- |
| `verify_milestone` | 用 `operation_id` 幂等关闭里程碑 |
| `list_comparisons` / `submit_comparison` | 前后帧对比 |
| `list_goldens` / `record_golden` / `check_golden` | 黄金帧 |

`submit_comparison` 的可选检查点引用必须存在于当前项目的宿主检查点列表，否则拒绝保存。`record_golden` 将当前离屏 PNG 保存到插件的项目私有存储；`check_golden` 解码实际 RGBA 像素，以不同像素数占总像素数的比例与 `max_diff_ratio` 比较（默认 0.001，等于阈值算通过）。这不是感知相似度：动画、抗锯齿和字体渲染变化也可能产生差异，捕获前应固定场景。缺图片、解码失败或尺寸不同会报错；旧的占位黄金帧需要重新录制。

### 交付

| 工具 | 作用 |
| --- | --- |
| `record` / `list_recordings` / `sample_recording` / `read_telemetry` / `read_recording_video` | 宿主网页录制。`record` 会 start → probe(tick) → probe(input) → probe(advance) → stop，供里程碑遥测断言取样 |
| `game_delivery` | 准备/检查不可变产物；发布需账户，未接通时拒绝 |

`record` 的 `frames` 指推进次数（默认 1），每次推进 `ticks_per_frame` 个 tick（默认 1），然后等待 `settle_ms` 毫秒让页面绘制（默认 50）。录像 ID 和路径由宿主分配，不接受旧的 `id` / `path` 参数；PNG 证据帧通过 `sample_recording` 提取。完成后同会话的录像页自动刷新；停止失败也会释放插件侧活动录像引用，探针错误不会被停止错误覆盖。

远程 MCP 默认 URL（可在插件私有存储 `settings.json` 的 `mcpServers` 字段覆盖）：

- `origin-assets` → `https://api.origingame.dev/v1/assets/mcp`
- `origin-examples` → `https://registry.origingame.dev/mcp`
- `origin-game-knowledge` → `https://knowledge.origingame.dev/mcp`

## 里程碑

每个里程碑是一份宿主 Evaluation `Definition`。项目键经 `ctx.project.resolve(cwd)` 取得，插件不自己 hash。

- greybox：`bun` + `["run", "typecheck"|"build"|"check:arch"|"check:smoke"]`，cwd 为游戏项目根；外加两条 `recording-telemetry` 断言（playback 无拒绝且有派发、afterTick > beforeTick）
- content：同样的构建命令；节点是否指定只作为无 verifier 的准则
- delivery：构建命令 + 不可变产物命令

`create_project` / `accept_design` 会 `upsertDefinition` 到宿主账本。`verify_milestone` 调用 `ctx.evaluation.run` 并记下 attempt 与最新 checkpoint id。录像列表来自 `ctx.recording.list`。文件回退走宿主检查点入口，不另造插件工具。
