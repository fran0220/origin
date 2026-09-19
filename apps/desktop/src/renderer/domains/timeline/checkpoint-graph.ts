import type { MainlineCheckpoint } from "@origin/runtime-checkpoints";
import type { GraphCommitNode, GraphFeedbackEdge } from "@origin-org/ui/git-graph";

export interface TimelineGraphNode extends GraphCommitNode {
	readonly checkpointId: string;
	readonly projectKey: string;
	readonly subject: string;
	readonly synthetic?: boolean;
}

export interface TimelineGraph {
	readonly nodes: readonly TimelineGraphNode[];
	readonly feedbackEdges: readonly GraphFeedbackEdge[];
}

/**
 * Project MainlineCheckpoint records onto a swimlane graph.
 * Parent edges follow landed git parents; revert commits become a synthetic
 * node plus a `feedback` edge back to the checkpoint they undid.
 */
export function projectCheckpointGraph(checkpoints: readonly MainlineCheckpoint[]): TimelineGraph {
	const ordered = [...checkpoints].sort((left, right) => right.createdAt - left.createdAt);
	const byLandedCommit = new Map<string, MainlineCheckpoint>();
	for (const checkpoint of ordered) {
		if (checkpoint.landed) byLandedCommit.set(checkpoint.landed.commit, checkpoint);
	}

	const nodes: TimelineGraphNode[] = ordered.map((checkpoint) => ({
		hash: nodeHash(checkpoint),
		parents: parentHashes(checkpoint, byLandedCommit),
		checkpointId: checkpoint.id,
		projectKey: checkpoint.projectKey,
		subject: checkpoint.intent,
	}));

	const feedbackEdges: GraphFeedbackEdge[] = [];
	const seenSynthetic = new Set<string>();
	for (const checkpoint of ordered) {
		const revertedBy = checkpoint.revertedBy;
		if (!revertedBy) continue;
		const reverter = byLandedCommit.get(revertedBy.commit);
		const fromHash = reverter ? nodeHash(reverter) : revertHash(revertedBy.commit);
		if (!reverter && !seenSynthetic.has(fromHash)) {
			seenSynthetic.add(fromHash);
			nodes.push({
				hash: fromHash,
				parents: checkpoint.landed ? [nodeHash(checkpoint)] : [],
				checkpointId: checkpoint.id,
				projectKey: checkpoint.projectKey,
				subject: checkpoint.intent,
				synthetic: true,
			});
		}
		feedbackEdges.push({ fromHash, toHash: nodeHash(checkpoint) });
	}

	return { nodes, feedbackEdges };
}

export function nodeHash(checkpoint: MainlineCheckpoint): string {
	return checkpoint.landed?.commit ?? checkpoint.id;
}

function revertHash(commit: string): string {
	return `revert:${commit}`;
}

function parentHashes(
	checkpoint: MainlineCheckpoint,
	byLandedCommit: ReadonlyMap<string, MainlineCheckpoint>,
): string[] {
	const parentCommit = checkpoint.landed?.parent;
	if (!parentCommit) return [];
	const parent = byLandedCommit.get(parentCommit);
	return parent ? [nodeHash(parent)] : [parentCommit];
}
