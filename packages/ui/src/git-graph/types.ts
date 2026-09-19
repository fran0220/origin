export interface GraphCommitNode {
	readonly hash: string;
	readonly parents: readonly string[];
	readonly subject?: string;
	readonly refs?: readonly string[];
	readonly authorName?: string;
	readonly authorEmail?: string;
	readonly timestamp?: number;
}

export type GraphHostMode = "light" | "dark";

export interface GraphFeedbackEdge {
	readonly fromHash: string;
	readonly toHash: string;
}
