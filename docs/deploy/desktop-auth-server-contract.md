# Desktop 认证服务端合同

本文件给 `vetta-serv` 实现。客户端已经按此合同写好；服务端未部署时 Desktop / CLI 会发现失败并走 legacy deep-link。

## 能力发现

`GET /.well-known/vetta-desktop-auth`（备选 `GET /auth/desktop-metadata`），JSON：

```json
{
  "authorization_endpoint": "https://app.example.com/auth/desktop/authorize",
  "token_endpoint": "https://api.example.com/api/v1/desktop/authorizations/token",
  "revocation_endpoint": "https://api.example.com/api/v1/auth/logout",
  "account_endpoint": "https://api.example.com/api/v1/users/me"
}
```

缺少 `authorization_endpoint` 或 `token_endpoint` 时客户端走 legacy。

## 授权页

浏览器打开 `authorization_endpoint`，query：

| 参数 | 值 |
| --- | --- |
| `client` | `desktop` 或 `cli` |
| `device_name` | 平台标签，如 `linux-desktop` |
| `redirect_uri` | `http://127.0.0.1:<port>/callback`（RFC 8252，禁止自定义 scheme 回传 token） |
| `response_type` | `code` |
| `code_challenge` | PKCE S256 |
| `code_challenge_method` | `S256` |
| `state` | 客户端一次性值 |

授权成功后 302 到 `redirect_uri?code=...&state=...`。**禁止**把 access/refresh token 放进 URL。

## 兑换

`POST token_endpoint`

```json
{
  "grant_type": "authorization_code",
  "code": "...",
  "code_verifier": "...",
  "redirect_uri": "http://127.0.0.1:12345/callback"
}
```

成功：

```json
{
  "access_token": "...",
  "refresh_token": "...",
  "token_type": "Bearer",
  "account": {
    "subject": "42",
    "username": "alice",
    "displayName": "Alice"
  }
}
```

授权码单次使用。重复兑换、state/verifier 不匹配、redirect_uri 不一致一律 400。

## 登出 / revoke

`POST revocation_endpoint`（现有 `/auth/logout` 可承担）

```json
{ "refresh_token": "..." }
```

必须真正撤销 refresh 及其 access。客户端会检查 HTTP 成功后再清本地；失败仍清本地，但会记日志。

## 设备列表（后续）

建议 `GET /desktop/devices` 与 `DELETE /desktop/devices/:id`，用同一 refresh 家族标识设备。客户端本轮不依赖它们，但登出语义应与设备撤销一致。

## Legacy

未发现 PKCE 元数据时，客户端仍打开 `/auth/deep-link?client_redirect=...`，token 经 query 回传。服务端实现本合同时不要删除该路径，直到所有客户端版本都完成能力发现。
