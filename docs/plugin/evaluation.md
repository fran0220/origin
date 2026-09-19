# Evaluation API

Plugin API 2.6.0 起，插件可以通过 `ctx.evaluation` 读取或触发平台级评估。评估记录属于宿主账本，不由插件私自改写 Attempt。

需要权限：

- `evaluation:read`：列出 Definition / Attempt，读取 Attempt 详情（含 Finding 与证据摘要）。
- `evaluation:run`：按 Definition 启动一次评估，并注册额外证据 Provider。

使用这些权限时把 `plugin.json#pluginApiVersion` 写成 `^2.6.0`。清单校验对未知权限 fail-closed；旧宿主会给出「Unsupported plugin API version」，而不是静默丢掉权限条目。

```ts
const attempt = await ctx.evaluation.run({
  definitionId: "def-build",
  trigger: { kind: "manual" },
});

ctx.evaluation.registerEvidenceProvider({
  kind: "plugin-artifact",
  async capture(scopeKey, trigger) {
    void scopeKey;
    void trigger;
    return { evidence: [] };
  },
});
```

约束：

- 模型自述不是证据。插件可以把说明写进 Finding.note 的消费方，但不能把自然语言审阅伪装成 Evidence。
- `registerEvidenceProvider` 在插件停用时必须随 activation 一起 dispose；宿主不会替插件保留跨重启的回调。
- Recording / Checkpoint 证据源由对应 runtime 包落地后接入；当前默认适配器可能返回空集。
