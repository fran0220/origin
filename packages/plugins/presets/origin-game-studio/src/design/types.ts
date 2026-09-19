export type Substrate = "canvas2d" | "three";
export type DesignChoice = "open" | "chosen" | "rejected";
export type DesignRelation = "dependency" | "containment";
export type MilestoneKind = "greybox" | "content" | "delivery";
export type DesignNodeKind =
	| "art_direction"
	| "level"
	| "core_loop"
	| "system"
	| "entity"
	| "screen"
	| "journey"
	| "delivery";

export interface RevisionReference {
	location: string;
	revision: string;
}

export interface DesignReference {
	id: string;
	title: string;
	source: RevisionReference;
	purpose: string;
}

export interface SpecificationSection {
	id: string;
	title: string;
	markdown: string;
	required: boolean;
}

export interface AcceptanceCriterion {
	id: string;
	description: string;
	journeyNodes: string[];
}

export interface ProductionConstraint {
	id: string;
	description: string;
	limit?: string | null;
}

export interface ProductionInput {
	nodeId: string;
	referenceId: string;
	constraint: string;
}

export interface ProductionRoute {
	method: "hand_authored" | "procedural" | "generated" | "imported" | "hybrid";
	rationale: string;
	inputs: ProductionInput[];
	editableFormat: string;
	exportFormat: string;
}

export interface NodeSpecification {
	sections: SpecificationSection[];
	criteria: AcceptanceCriterion[];
	journeyNodes: string[];
	knowledge: RevisionReference[];
	constraints: ProductionConstraint[];
	route?: ProductionRoute | null;
}

export interface ProductionBrief {
	intent: string;
	scope: string[];
	outOfScope: string[];
	specification: NodeSpecification;
}

export interface ProductionMilestone {
	id: string;
	title: string;
	kind: MilestoneKind;
	nodeIds: string[];
}

export interface RuntimeConsumer {
	nodeId: string;
	source: RevisionReference;
}

export interface VerificationReference {
	criterionId: string;
	evaluation: RevisionReference;
	subject: RevisionReference;
}

export interface SourceArtifact {
	id: string;
	title: string;
	designReferences: string[];
	original: RevisionReference;
	editableSource?: RevisionReference | null;
	export?: RevisionReference | null;
	consumers: RuntimeConsumer[];
	verification: VerificationReference[];
}

export interface DesignNode {
	id: string;
	kind: DesignNodeKind;
	title: string;
	intent?: string | null;
	image?: string | null;
	group?: string | null;
	choice: DesignChoice;
	cut: boolean;
	specification: NodeSpecification;
	references: DesignReference[];
	artifacts: SourceArtifact[];
	verification: VerificationReference[];
	sources: string[];
}

export interface DesignEdge {
	from: string;
	to: string;
	relation: DesignRelation;
}

export interface DesignGraph {
	version: number;
	brief: ProductionBrief;
	substrate?: Substrate | null;
	milestones: ProductionMilestone[];
	nodes: DesignNode[];
	edges: DesignEdge[];
}

export type DesignGraphEditAction = "choose" | "reject" | "reopen" | "cut" | "restore";

export interface DesignGraphEdit {
	action: DesignGraphEditAction;
	node_id: string;
}

export const EMPTY_SPECIFICATION: NodeSpecification = {
	sections: [],
	criteria: [],
	journeyNodes: [],
	knowledge: [],
	constraints: [],
	route: null,
};

export function emptyGraph(intent: string): DesignGraph {
	return {
		version: 2,
		brief: {
			intent,
			scope: [],
			outOfScope: [],
			specification: { ...EMPTY_SPECIFICATION },
		},
		milestones: [],
		nodes: [],
		edges: [],
	};
}
