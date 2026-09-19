# ADR-0120：认证与 BYOK 收敛为 Connection 凭据托管

## 状态

已接受

## 背景

账号 access/refresh token 曾明文写在 `~/.vetta/agent/settings.json` 与 `~/.vetta/auth.json`，renderer 还能通过 IPC 拿到明文。BYOK Key、MCP env/headers、CLI Provider Key 各自一套存储。登录走站点 deep-link，token 经 URL query 回传，有 state 无 PKCE，打包态依赖自定义 scheme。同机劫持、日志泄漏和跨进程误用 refresh token 都是真实风险。

Sophon 把 Provider 建模为不可携带 secret 的 Connection，用 loopback relay 把原始 Key 留在宿主，Authorization Code + PKCE S256 + RFC 8252 loopback 登录。本仓库需要同一底座，同时保持既有 `<provider>/<model>` 会话设置与插件 `modelKey` 可用。

## 决策

1. 平台中立 Connection 模型放在 `@vetta/coding-agent/connections`。类型上不可表示 secret。托管 Vetta 网关与 BYOK Provider 都是 Connection。模型身份为 `<connectionId>:<upstreamModelId>`，并与遗留 `<provider>/<model>` 双向映射。
2. `DialRouteTable` 只有 `fast`/`deep` 与用途路由。Project 级只保存路由，不保存 Key。同名模型跨 Connection 拒绝而非乱选。
3. 统一 Vault 在 `@vetta/runtime-node/credentials`。Desktop 优先 Electron safeStorage；Linux `basic_text` 与 CLI 降级为 owner-only 文件（0600 + 用户可见警告，Windows 设 owner-only ACL）。启动时把 settings/mcp/models/auth.json 中的 secret 迁进 Vault 并从原文件删除。
4. 主进程起 127.0.0.1 loopback relay。模型引擎、插件 `ctx.ai`、子代理、MCP 外部进程拿到的是 relay origin + 短作用域 bearer。`~/.vetta/auth.json` 改为按需写入该 bearer，不再写长期 access token。
5. 登录优先 Authorization Code + PKCE S256 + RFC 8252 loopback（打包态也走 loopback）。能力发现失败时保留 legacy deep-link。登出必须远端 revoke，再清 Vault 与 signed-in Connection。renderer 只持有 signed-in 标志，鉴权请求由 main 代发。
6. `getAgentDir()` 下按 `accounts/<sha256(accountScope)>/` 与 `logged-out/` 分区，提供 `resolveAccountScopedDir(kind)`。既有 checkpoints/evolution/recordings 目录迁入当前分区，不丢数据。
7. logger、debug-writer、diagnostics-bundle 统一 secret scrub。设置导出排除凭据。MCP 设置页与 JSON 编辑器展示遮罩。

## 备选方案

- 继续把 token 放 settings.json：改动最小，但 renderer、日志、备份、外部进程都会继续接触长期凭据。
- 只用 OS keychain、不做 relay：Desktop 能藏 Key，但模型 runtime、插件和 MCP 子进程仍要拿到明文才能发请求。
- 立刻切断 `<provider>/<model>`：模型身份更干净，但会破坏已有会话、defaultModel 和插件 `ctx.ai`。

## 后果

用户在设置里看到 Connections，而不是一串能复制走的 Key。登录墙在服务端实现 PKCE 合同后走 loopback；未实现前仍可用 legacy。vetta-serv 必须补 `docs/deploy/desktop-auth-server-contract.md` 中的发现、兑换、revoke 端点，客户端才能默认关闭 deep-link 回传 token。Checkpoint / Evolution / Recording 线程应改为调用 `resolveAccountScopedDir`。
