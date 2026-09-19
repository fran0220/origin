# @vetta/runtime-evaluation

Platform-neutral Evaluation records for Vetta hosts.

## What it owns

- Five-record model: Definition, Attempt, Evidence, Finding, Outcome
- TypeBox schemas (`recordType` + `schemaVersion`) with current-write / compatible-read
- Pure aggregation: required criteria settle `passed` / `failed` / `inconclusive` / `error`
- Ports: `EvaluationStore`, `EvaluationEvidenceProvider`, `VerifierRunner`
- In-memory store and the host-agnostic `EvaluationService`

## What it does not own

- File I/O, command execution, Desktop IPC or UI
- Checkpoint / Recording / Trace / Artifact implementations

Node hosts bind this package through `@vetta/runtime-node/evaluation`.
