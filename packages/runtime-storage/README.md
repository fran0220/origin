# @origin/runtime-storage

Platform-neutral conversation storage contracts, errors, and persisted record schemas.

The package deliberately contains no filesystem, process, database, Electron, or browser I/O. Platform runtimes implement these contracts. The shared Node implementation is published by `@origin/runtime-node` and selected by `@origin/runtime-desktop` or other Node hosts.

## Main Exports

- `ConversationRepository`, `ConversationContinuationStore`, and `ConversationPersistence`
- `ConversationOwnershipManager` and `ConversationOwnershipLease`
- stable storage errors and error codes
- persisted conversation schema versions

Repository and document types currently preserve their `runtime-core` structural contracts during migration. Their physical ownership will be inverted after all concrete adapters have moved out of the protocol packages.
