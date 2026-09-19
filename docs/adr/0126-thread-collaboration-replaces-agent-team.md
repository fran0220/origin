# ADR-0126：Thread 协作取代 Agent Team，Dial 成为唯一努力档

## 状态

落地（Thread 协作工具、Dial 冻结、Agent Team 产品面删除）

## 背景

Origin 同时存在四套相近的协作与模式轴：Conversation Session、进程内 Subagent（含共享 cwd 的 workflow）、Desktop Agent Team（持久 roster + 协调/成员双会话）、以及 `work`/`coding` 任务解释模式。Amp 的 harness 只有三种协作：人对一个 Thread 说话、Thread 再开 Thread、Thread 内请隔离的 specialist。Agent Team 与 workflow 批次工人是第二、第三套跨会话协议，和 Thread 图抢模型注意力，也让会话列表、所有权目录和工具面膨胀。

`DialRouteTable` 只有未接到会话创建的 `fast`/`deep` 路由；会话内仍可换模型与 thinking。Amp Dial 是首条消息冻结的 effort mode，换档必须开新 Thread。

## 决策

1. **Thread 是唯一跨会话协作单元。** Conversation Session 的 `sessionId` 即 `threadId`。Thread 出现在会话列表，可被其他 Thread 引用、投递、等待。`parentThreadId` 记录协作血缘，与历史 `parentSessionPath` 分叉血缘分开。
2. **Agent Team 退役。** 删除 `@vetta/agent-team`、Desktop `agent-teams` 运行时、IPC、团队会话、插件 `agent.teams[]` 和 `team_*` 工具。自定义 Agent Profile 与插件 `agent.agents[]` 保留，作为 Dial 上的 custom mode / 新建 Thread 可选人格，不再组成持久 roster。
3. **Subagent 降为 in-thread specialist。** 保留隔离、只读的 `explorer`（及后续 oracle/search）。删除产品入口 `dispatch_workflows`、`workflow` 类型、`report_to_parent` 以及共享 cwd 的并行工人。跨任务并行走 `create_thread`。
4. **Effort Dial 是用户拧的唯一档位。** 内置 `low | medium | high | ultra`。每个档绑定主模型、reasoning、prompt overlay、工具策略和 Oracle。Thread 首条用户消息后冻结 `dialMode`；换档 = 新 Thread（handoff）。`work`/`coding` 退出默认 UI：默认主路径是 Coding；Work 仅作为可选 custom mode。
5. **协作工具合同对齐 Amp：**
   - `create_thread` 立即返回 id，不等推理结束。
   - `send_thread_message` 投递即返回；`wake` 默认 true。
   - 已要求对方 reply 回本 Thread 时，禁止再 `wait_for_threads` 同一目标。
   - `wait_for_threads` 在 `idle | awaiting_approval | error` 视为 settled；`idle` 不是成功。
   - 消息不携带文件或 git 状态；文件走显式传递端口。
   - `find_thread` / `read_thread` 是模型工具，不是宿主迁移 API。
6. Runtime Core 拥有产品无关的 Thread 图、投递互斥和等待端口；Coding Agent 拥有工具、Dial 产品和 prompt；Desktop 拥有列表、picker 和 Profile。下层不得认识 Team 或 workflow。

## 备选方案

- 把 Team 做成 Thread 的一种 backend：保留两套身份和工具，否决。
- 只藏 Team UI、保留 roster 与 `team_*`：模型仍会走旧协议，否决。
- 用 `spawn_agent` 改名冒充 `create_thread` 却不进会话列表：用户无法打开、继续或引用，否决。
- 会话中途改 Dial/主模型：破坏 prompt cache 与 Turn 冻结，否决。

## 后果

用户与 Agent 用同一套 Thread 图协作；自定义人格仍可选，但不能组队开会。没有历史 Team 数据需要迁移。并行实现需要独立 cwd/worktree 才安全；API 预留执行器字段，同机共享工作区的 fan-out 必须由 prompt 约束文件范围。
