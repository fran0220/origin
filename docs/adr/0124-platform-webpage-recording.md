# ADR-0124：平台级网页录制与 ffmpeg 托管运行时

## 状态

已接受

## 背景

Game Studio 与 Evaluation 需要把一次可复现的网页运行变成带时间戳的视频证据，而不是模型自述。仓库已有离屏截图（ADR-0058）和媒体作业（ADR-0059），但截图没有时长、没有音频、没有抽帧合同；浏览器自动化走的是外部 `agent-browser` Chrome，不能依赖 CDP `Page.startScreenRecording`。消息协议只有 `TextContent | ImageContent`，`ModelInputCapability` 虽有 `"video"` 标签却没有实现。ffmpeg 也不在托管运行时清单里。

并行的 Evaluation 线程会把 `RecordingRecord` 当作证据来源，字段名必须稳定。账号分区（Connection 线程）要求录制落在 `<agentDir>/accounts/<hash>/recordings/` 或 `logged-out/recordings`，不能再写裸的 `<agentDir>/recordings`。

## 决策

1. 新增平台中立包 `@vetta/runtime-recording`，持有 `RecordingRecord` TypeBox schema、状态机（recording → finalizing → ready | failed）、保留期计算（可注入时钟）以及 `RecordingEngine` / `FrameEncoder` / `RecordingStore` 端口。Evaluation 只依赖这些字段名。
2. Desktop 用 Electron OSR `BrowserWindow` + `webContents.setFrameRate(30)` + `paint` 得到带时间戳的 NativeImage 帧流，BGRA→RGBA 后经 stdin rawvideo 喂给 ffmpeg。默认输出 H.264 + AAC MP4（`-movflags +faststart`），可选 AV1。帧队列超限丢帧并写入 `telemetry.jsonl`。
3. 页面音频通过 preload 把 `AudioContext` 接到 `MediaStreamAudioDestinationNode`，`MediaRecorder(audio/webm;codecs=opus)` 分段回传主进程，结束时 mux；无音频源产出无声 MP4 并标 `audio: "none"`。
4. `RuntimeType` 增加 `"ffmpeg"`，沿 ADR-0011 的内置 / 下载 / 系统探测三级策略。版本号与 sha256 只写在 `apps/desktop/src/main/runtimes/manifest.json`，来源 eugeneware/ffmpeg-static b6.1.1。校验失败拒绝安装。
5. `packages/ai` 新增 `VideoContent`。Gemini 映射 `inlineData`（≤20 MiB）或 Files API 上传后的 `fileData`；其它 Provider 遇 video part 返回 `UNSUPPORTED_CAPABILITY`。`review_recording` 预算 128 MiB，超出先降码率再拒绝。
6. Agent 工具 `recording_start/stop/sample/read/list/clear` 与 `review_recording` 经 coding-agent composition 注入；plugin-sdk 增加 `ctx.recording` 与权限 `recording:capture`（Plugin API 2.7.0）。Desktop 设置页展示 ffmpeg 来源与默认保留期，activity dock 提供 Recording 面板。
7. `file:` URL 仅允许项目 cwd 内路径。持久化根目录经 `resolveAccountScopedDir(..., "recordings")` 解析；宿主启动时扫描清理过期与孤儿目录。`until-cleared` 必须显式 clear。

## 备选方案

- CDP `Page.startScreenRecording`：本仓库浏览器自动化驱动外部 Chrome，且该 API 未在本产品验证。
- 把录制塞进现有 `ArtifactStore` / `ctx.media`：作业语义是临时产物，没有保留期、状态机和 Evaluation 字段合同。
- 只抽 PNG 帧、不编码 MP4：无法满足多模态模型审阅与用户回放。
- 系统 ffmpeg 优先：与 ADR-0011「永远优先托管版」冲突，agent 行为会随用户机器变化。

## 后果

网页录制成为平台能力，Game Studio 与 Evaluation 可以引用同一份 `RecordingRecord`。Desktop 安装包增加 ffmpeg/ffprobe 静态构建；设置页多一行运行时与保留期。插件必须声明 `recording:capture` 且 `pluginApiVersion ^2.7.0`。未登录数据落在 `logged-out/recordings`，切换账号不会串目录。Electron OSR 无法在纯 Node 单元测试里跑，编码链路用假帧源 + 系统 ffmpeg 覆盖，真实窗口由后续 E2E 补充。
