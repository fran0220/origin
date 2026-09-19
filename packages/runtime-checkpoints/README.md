# @vetta/runtime-checkpoints

Platform-neutral checkpoint domain for Vetta runtimes.

This package owns the Mainline Checkpoint record, Execution Receipt schema,
pure state machine, and the durable Reactor. Node I/O (shadow git, JSONL)
lives in `@vetta/runtime-node/checkpoints`. Desktop owns IPC and the Timeline UI.

See ADR-0123 and `docs/game-studio/README.md` §4.

Desktop persistence lives under the account-scoped directory returned by
`resolveAccountScopedDir("checkpoints")`, not `<agentDir>/checkpoints`.
