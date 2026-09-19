export { FileCheckpointStore, type FileCheckpointStoreOptions } from "./jsonl-store.js";
export {
	checkpointMainlinePath,
	checkpointPolicyPath,
	checkpointProjectDir,
	checkpointReceiptsPath,
	checkpointShadowGitDir,
	sanitizeProjectKey,
} from "./layout.js";
export {
	createExecutionId,
	createExecutionReceiptCollector,
	type ExecutionReceiptCollector,
	type ExecutionReceiptContext,
	type ExecutionReceiptSession,
	type ExecutionReceiptSink,
	getExecutionReceiptCollector,
	outcomeFromCommandResult,
	registerExecutionReceiptSink,
	setExecutionReceiptCollectorForTests,
} from "./receipt-emitter.js";
export { createNodeWorkTreeVcs, type NodeWorkTreeVcsOptions } from "./shadow-vcs.js";
export { createNodeVerificationRunner, type NodeVerificationRunnerOptions } from "./verification-runner.js";
