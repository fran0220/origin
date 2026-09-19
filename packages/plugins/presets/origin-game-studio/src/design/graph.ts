import { GRAPH_FILE, GRAPH_VERSION } from "../ids";
import { sha256Hex } from "../sha256";
import type { DesignGraph, DesignGraphEdit, DesignNode } from "./types";

export class DesignGraphError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "DesignGraphError";
	}
}

export function graphRevision(bytes: string): string {
	return `sha256:${sha256Hex(bytes)}`;
}

export function isActiveNode(graph: DesignGraph, nodeId: string): boolean {
	const node = graph.nodes.find((candidate) => candidate.id === nodeId);
	if (!node || node.cut || node.choice === "rejected") return false;
	return !containedByInactive(graph, nodeId);
}

function containedByInactive(graph: DesignGraph, nodeId: string): boolean {
	const seen = new Set<string>();
	const stack = [nodeId];
	while (stack.length > 0) {
		const current = stack.pop();
		if (!current || seen.has(current)) continue;
		seen.add(current);
		for (const edge of graph.edges) {
			if (edge.relation !== "containment" || edge.to !== current) continue;
			const parent = graph.nodes.find((node) => node.id === edge.from);
			if (!parent) continue;
			if (parent.cut || parent.choice === "rejected") return true;
			stack.push(parent.id);
		}
	}
	return false;
}

export function activeNodes(graph: DesignGraph): DesignNode[] {
	return graph.nodes.filter((node) => isActiveNode(graph, node.id));
}

function validateSubjectLocation(location: string): void {
	const split = location.split(":");
	if (split.length === 2) {
		const [kind, id] = split;
		const validId = id.length > 0 && /^[A-Za-z0-9_-]+$/.test(id);
		if ((kind === "recording" || kind === "comparison") && validId) return;
		if (kind === "archive" && /^[a-f0-9]{64}$/.test(id)) return;
	} else if (
		location.trim().length > 0 &&
		!location.includes("\\") &&
		!location.startsWith("/") &&
		!location.split("/").some((part) => part === ".." || part === "")
	) {
		return;
	}
	throw new DesignGraphError(
		"verification subject must be a workspace-relative file, recording:<id>, comparison:<id>, or archive:<64 lowercase hex digest>",
	);
}

export function validateDesignGraph(graph: DesignGraph): void {
	if (graph.version !== GRAPH_VERSION) {
		throw new DesignGraphError(
			`the design graph ${GRAPH_FILE} declares version ${graph.version}, and this application reads version ${GRAPH_VERSION}`,
		);
	}
	const seen = new Set<string>();
	for (const node of graph.nodes) {
		if (node.id.trim().length === 0) {
			throw new DesignGraphError(`the design graph ${GRAPH_FILE} holds a node with a blank id`);
		}
		if (seen.has(node.id)) {
			throw new DesignGraphError(`the design graph ${GRAPH_FILE} names ${node.id} twice`);
		}
		seen.add(node.id);
		if (node.title.trim().length === 0) {
			throw new DesignGraphError(`the design graph node ${node.id} has no title`);
		}
		if (node.group !== undefined && node.group !== null && node.group.trim().length === 0) {
			throw new DesignGraphError("alternative group must not be blank");
		}
		if (node.choice !== "open" && !node.group) {
			throw new DesignGraphError(
				`the design graph node ${node.id} is marked chosen or rejected without an alternative group`,
			);
		}
		for (const reference of [
			...node.verification,
			...node.artifacts.flatMap((artifact) => artifact.verification),
		]) {
			validateSubjectLocation(reference.subject.location);
		}
	}

	const edgeIds = new Set<string>();
	for (const edge of graph.edges) {
		const key = `${edge.from}\0${edge.to}\0${edge.relation}`;
		if (edgeIds.has(key)) {
			throw new DesignGraphError(`duplicate graph edge ${edge.from} → ${edge.to}`);
		}
		edgeIds.add(key);
		for (const end of [edge.from, edge.to]) {
			if (!seen.has(end)) {
				throw new DesignGraphError(
					`the design graph edge ${edge.from} → ${edge.to} names ${end}, which is not a node`,
				);
			}
		}
		if (edge.from === edge.to) {
			throw new DesignGraphError(`the design graph edge on ${edge.from} points at itself`);
		}
	}

	const chosen = new Set<string>();
	for (const node of graph.nodes.filter((candidate) => candidate.choice === "chosen")) {
		if (!node.group) continue;
		if (chosen.has(node.group)) {
			throw new DesignGraphError(`the design graph alternative group ${node.group} has more than one chosen node`);
		}
		chosen.add(node.group);
	}

	for (const relation of ["dependency", "containment"] as const) {
		const remaining = new Set(seen);
		while (remaining.size > 0) {
			const roots = [...remaining].filter(
				(id) =>
					!graph.edges.some(
						(edge) => edge.relation === relation && edge.to === id && remaining.has(edge.from),
					),
			);
			if (roots.length === 0) {
				throw new DesignGraphError(`${relation} cycle in design graph`);
			}
			for (const root of roots) remaining.delete(root);
		}
	}

	validateMilestoneOrderShape(graph);
}

function validateMilestoneOrderShape(graph: DesignGraph): void {
	if (graph.milestones.length === 0) return;
	const greybox = graph.milestones.filter((milestone) => milestone.kind === "greybox");
	if (greybox.length !== 1 || graph.milestones[0]?.kind !== "greybox") {
		throw new DesignGraphError("acceptance requires first/only greybox milestone");
	}
	const last = graph.milestones[graph.milestones.length - 1];
	if (last?.kind !== "delivery") {
		throw new DesignGraphError("acceptance requires a final delivery milestone");
	}
}

export function applyDesignEdit(graph: DesignGraph, edit: DesignGraphEdit): DesignGraph {
	validateDesignGraph(graph);
	const index = graph.nodes.findIndex((node) => node.id === edit.node_id);
	if (index === -1) {
		throw new DesignGraphError(`the design graph has no node named ${edit.node_id}`);
	}
	const nodes = graph.nodes.map((node) => ({ ...node }));
	const target = nodes[index];
	if (!target) {
		throw new DesignGraphError(`the design graph has no node named ${edit.node_id}`);
	}
	switch (edit.action) {
		case "choose": {
			if (!target.group) {
				throw new DesignGraphError("choose requires an alternative group");
			}
			const chosenSibling = nodes.find(
				(node, other) => other !== index && node.group === target.group && node.choice === "chosen",
			);
			if (chosenSibling) {
				throw new DesignGraphError(
					`an already Chosen sibling must first be reopened or rejected before choosing ${edit.node_id}`,
				);
			}
			for (const node of nodes) {
				if (node.id !== target.id && node.group === target.group && node.choice === "open") {
					node.choice = "rejected";
				}
			}
			target.choice = "chosen";
			break;
		}
		case "reject":
			target.choice = "rejected";
			break;
		case "reopen":
			target.choice = "open";
			break;
		case "cut":
			target.cut = true;
			break;
		case "restore":
			target.cut = false;
			break;
	}
	const next = { ...graph, nodes };
	validateDesignGraph(next);
	return next;
}

export function specificationHoles(spec: DesignGraph["brief"]["specification"], holes: string[]): void {
	if (spec.sections.filter((section) => section.required && section.markdown.trim().length === 0).length > 0) {
		holes.push("required specification sections are empty");
	}
	if (spec.criteria.length === 0) {
		holes.push("no acceptance criteria");
	}
}

export function acceptanceHoles(graph: DesignGraph): string[] {
	const holes: string[] = [];
	if (graph.milestones.length === 0) {
		holes.push("plan the first playable, remaining content and delivery milestones");
	}
	if (graph.brief.intent.trim().length === 0) {
		holes.push("production brief intent is empty");
	}
	if (graph.brief.scope.length === 0) {
		holes.push("production brief scope is empty");
	}
	if (graph.brief.outOfScope.length === 0) {
		holes.push("production brief out-of-scope is unspecified");
	}
	specificationHoles(graph.brief.specification, holes);
	if (activeNodes(graph).length === 0) {
		holes.push("no active content nodes");
	}
	for (const node of activeNodes(graph)) {
		if (node.group && node.choice === "open") {
			holes.push(`${node.title}: unresolved alternative in ${node.group}`);
		}
	}
	return holes;
}

export function prepareProduction(
	graph: DesignGraph,
	nodeId: string,
): { nodeId: string; inputs: DesignGraph["nodes"][number]["references"]; missingInputs: string[] } {
	const node = graph.nodes.find((candidate) => candidate.id === nodeId);
	if (!node) {
		throw new DesignGraphError(`unknown production node ${nodeId}`);
	}
	const missingInputs: string[] = [];
	if (!isActiveNode(graph, nodeId)) {
		missingInputs.push("node or containing family is cut or rejected");
	}
	specificationHoles(node.specification, missingInputs);
	const inputs = node.specification.route?.inputs ?? [];
	const resolved = [];
	for (const input of inputs) {
		const source = graph.nodes.find((candidate) => candidate.id === input.nodeId);
		const reference = source?.references.find((item) => item.id === input.referenceId);
		if (!source || !isActiveNode(graph, source.id) || !reference) {
			missingInputs.push(`missing production input ${input.nodeId}/${input.referenceId}`);
			continue;
		}
		resolved.push(reference);
	}
	return { nodeId, inputs: resolved, missingInputs };
}
