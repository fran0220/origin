# ADR-0127：Recording 遥测断言是受限 JSON，不是 JS

## 状态

已接受

## 背景

Evaluation 的 assertion verifier 只有 `source: "recording-telemetry"` 和一个 `expression` 字符串。旧实现对遥测原文做 `includes` / `key == value` 子串匹配，既不能计算 Game Studio greybox 需要的 `playback.refused === 0 && playback.dispatched > 0` 与 `afterTick > beforeTick`，也会把无关字段里的同值当成通过。Recording 的事实源是 `telemetry.jsonl` 行 `{ atMs, kind, payload }`，probe 曾经只把 `input` 写进 `input.jsonl`，断言读不到执行反馈。

## 决策

1. `expression` 必须是受限 JSON 对象字符串，禁止 `eval`、任意 JS 和子串 DSL。白名单：`all` / `any` / `not` 与 `{ path, op, value | other }`。`op` 仅 `eq|ne|gt|gte|lt|lte`。路径是点分标识符，拒绝 `__proto__` / `constructor` / `prototype`。
2. 断言只读 `telemetry.jsonl`。投影对象仅含：
   - `playback.dispatched` / `playback.refused`：`kind:"input"` 且 `ok===true` 且 `result` 为 boolean 的计数；没有任何可解释的 input 行则路径缺失。
   - `beforeTick` / `afterTick`：`kind:"tick"|"advance"` 的有限数字结果（`payload.result` 或旧行纯 number）。至少两个样本才定义；before 为第一条，after 为最后一条。
3. Desktop `recording.probe` 对每个 kind（含 `input`）追加 telemetry 行 `{ atMs, kind, payload: { ok, result|error, request } }`。`runtime-recording` 的 telemetry kind 增加 `"input"`。page 侧优先调用 `__runtime_probe__`。
4. Finding：路径缺失 / 无录像 / 空文件 → `inconclusive`；路径都在但谓词假 → `failed`；非法 expression、坏 JSONL、读失败、captured digest 与实际字节不一致 → `error`。缺数据不得填 0 或当 pass。
5. 选择证据时不以「第一条 recording」为准。`manual.ref` 匹配 `recordingId`；否则范围内必须恰好一条带 `telemetryPath` 的 recording。milestone.ref 不是录像 ID。Verifier 不覆盖原证据 id；digest 必须等于 `sha256Text(telemetryText)`。

Game Studio greybox 原文：

```json
{"all":[{"path":"playback.refused","op":"eq","value":0},{"path":"playback.dispatched","op":"gt","value":0}]}
{"path":"afterTick","op":"gt","other":"beforeTick"}
```

`graph.node.<id>.active` 不是 recording telemetry 字段，不得作为 `recording-telemetry` 断言。

## 备选方案

- 继续子串匹配：无法表达合取与比较，且同值会出现在无关字段。
- 允许任意 JS：无法在不可信插件 expression 上禁止 `eval`。
- 从 `input.jsonl` 推断 playback：那份文件只记录请求，不能证明游戏接受了输入。

## 后果

插件必须发出 JSON expression，而不是 JS。greybox 录像需要 `probe(tick)`、至少一次成功的 `probe(input)`（boolean true）以及再次 `probe(tick|advance)`。digest 不一致视为文件已变，由宿主重新捕获，而不是 verifier 覆盖证据。
