# Team: Runtime

> 本包属于 **Runtime Team**。生产源码不得导入 `node:*`、Electron、DOM 或具体平台 Runtime。

## 职责范围

网页录制的平台中立领域：`RecordingRecord` TypeBox schema、状态机、保留期计算、JSONL 行格式，以及 `RecordingEngine` / `FrameEncoder` / `RecordingStore` 端口。

具体 ffmpeg、文件系统和 Electron OSR 实现分别放在 `@origin/runtime-node` 与 Desktop 宿主。
