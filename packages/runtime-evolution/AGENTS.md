# Team: Runtime

> 本包属于 Runtime 能力域，拥有平台中立的 continual-harness 账本。

## 职责范围

两级 Evolution 账本的领域类型、校验、CAS 提交、rollback/promote、确定性渲染与存储端口。
不访问文件系统、进程、Electron 或具体宿主。

## 注意事项

- 生产源码不得导入 `node:*`、Electron、DOM 或平台 Runtime
- Node JSONL 实现位于 `@origin/runtime-node`
- 不得依赖 `@origin/coding-agent` 或应用包
- Harness 是规则层，不替代 Memory；`kind: skill/subagent` 只是提示词级引导

## 测试要求

- 使用 Vitest Node；事件链 digest、CAS、rollback、promote、预算和渲染顺序必须有单测
- 不得读写用户真实 `evolution/` 目录
