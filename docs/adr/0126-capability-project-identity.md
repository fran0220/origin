# ADR-0126：宿主统一 Capability 项目身份

## 状态

已接受

## 背景

Evaluation、Checkpoint、Recording 与 Game Studio 各自用 cwd 派生存储键：Evaluation 用 `sha256(cwd)` 前 16 位且 Home 进 global scope；Checkpoint 用 cwd 的 base64url，Home 为 `home`；Game Studio 用 `sha256(cwd)` 前 24 位写录像；Recording 由调用方传入 `projectKey`。插件继续自算会在 Windows 大小写/分隔符、Home 对话目录和长路径上分叉，也无法安全读回旧账本。

并行问题是 Checkpoint 目录名把 projectKey 截成 128 字符：足够长的 base64url 会碰撞。`decodeProjectKey` 又把任意字符串交给 Buffer，解码失败时 `cwdFor` 回落到对话 Home，恢复会写错工作树。

## 决策

1. Desktop 主进程提供唯一公开 descriptor，插件不再自算存储键：

   ```ts
   {
     cwd: string;
     evaluationScope: EvaluationScope;
     checkpointProjectKey: string;
     recordingProjectKey: string;
   }
   ```

   纯函数 `resolveCapabilityProject(cwd, projects, homeCwd?)`；`resolveDesktopCapabilityProject(cwd)` 读 Desktop 配置里的活跃与归档项目。相对路径拒绝。已登记项目按既有 `sameProjectPath`（大小写与分隔符不敏感）对齐到登记拼写。

2. 不要求各账本物理键同名，也不改写已有文件名：
   - Home / 对话默认 cwd → `evaluationScope: { kind: "global" }`，checkpoint / recording 键均为 `home`。
   - 项目 Evaluation 仍用 `sha256(canonicalCwd)` 前 16 位；该值同时是 Recording **新写**键。
   - Checkpoint 仍用 canonical cwd 的 base64url。
   - `evaluationScope` 不是存储键，禁止把 `global` / `project:<key>` 当作 checkpoint 或 recording 目录名。

3. 按 Evaluation `scopeKey` 反查同一项目：`lookupCapabilityProjectByEvaluationScopeKey` / `resolveCapabilityProjectKeysForEvaluationScope`。命中时返回 checkpoint 存储键（含 Windows 别名编码）以及允许的录像键集合（hash16 + 遗留 Game Studio hash24）。未知 scope、`project:home`、零命中或无法唯一确定的 hash 一律返回 `undefined`（fail closed），不得回落到 Home。

4. 身份解析只依赖 cwd 与项目列表，不读账号目录。账号隔离仍由调用方固定的 `checkpoints` / `evaluation` / `recordings` 根目录负责；切换账号后应换根再查，而不是在 identity 模块里缓存分区。

5. Checkpoint 兼容与安全：
   - `decodeProjectKey` 只接受能原样 round-trip 的 base64url 绝对路径；`home` 不是路径。
   - `cwdFor` / `checkpointCwdForProjectKey` 对无法解析的键抛错，禁止回落 Home。
   - 目录名不再截断。超过 128 字符的新键写入 `long.<sha256(projectKey)>`。仅当遗留截断目录里 mainline/policy 的 `projectKey` 以及 receipts 的 `projectKey`/`cwd`（cwd 按既有 base64url）全部且唯一等于当前键时才复用；空目录、坏行或无法证明归属时改走 hashed 名，不把无法证明的 shadow git / receipts 交给当前项目；混有多个所有者则抛错，不迁移、不恢复。

6. `DesktopCheckpointService.listReceipts(projectKey)` 直接读正在写入的 `FileCheckpointStore`，不另建缓存副本。

## 备选方案

- 把所有账本迁到单一 hash 键：会丢掉现有 Checkpoint / Evaluation / Game Studio 目录，拒绝。
- 无法解码时回落 Home：实现短，但会把未知项目的 shadow git 打进对话工作树。
- 长键继续截断并在目录内再分文件：无法分开已经写在同一 jsonl 里的碰撞记录。
- 在 identity 模块持久化 cwd→hash 对照表：当前 Desktop 项目列表已是对照表；hash 碰撞 fail closed 比静默写错更安全。若将来 16 位前缀真的碰撞，再加显式映射。

## 后果

插件经宿主 descriptor 使用 Evaluation / Checkpoint / Recording。旧 hash24 录像仍能被 scope 反查找出。长路径 Checkpoint 不再静默串目录；无法解析的恢复会失败而不是写进 Home。切换账号只要换分区根目录，identity 结果不变。
