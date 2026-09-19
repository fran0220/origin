# Team: Runtime

> 本包属于 **Runtime Team**，同组包：`runtime-core`、`runtime-storage`、`runtime-node`、`runtime-telemetry`

## 职责范围

平台中立的 Evaluation 领域：五记录模型、TypeBox schema、聚合规则、证据/verifier 端口与无 I/O 的服务编排。

## 注意事项

- 生产源码不得导入 `node:*`、Electron、DOM 或具体平台 Runtime
- 文件账本、命令型 verifier、证据适配器的 Node 实现位于 `@origin/runtime-node`
- 不得依赖 `@origin/coding-agent`、`apps/*` 或其它 `runtime-*` 的具体实现
- 模型自述不是证据；模型审阅只能进入 `Finding.note`

## 测试要求

- 聚合规则、指纹去重、Attempt 不可变与 schema 兼容读必须有合同测试
- 使用 Vitest；不得读取或修改用户真实评估目录
