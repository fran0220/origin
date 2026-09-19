import type { PluginStorageApi } from "@vetta-org/plugin-sdk";
import type { Substrate } from "../design/types";
import type { GameGenre } from "../genres";
import { sha256Hex } from "../sha256";

export const OPENING_VERSION = 1;

export interface OpeningRecord {
	version: number;
	idea: string;
	genre: GameGenre | null;
	existing: boolean;
}

export interface StageSnapshot {
	running: boolean;
	url: string | null;
	port: number | null;
	tick: number | null;
	lastFrameAt: number | null;
	probeReady: boolean;
}

export interface BuildSnapshot {
	status: "idle" | "running" | "succeeded" | "failed";
	command: string | null;
	exitCode: number | null;
	outputTail: string;
	startedAt: number | null;
	finishedAt: number | null;
}

export interface AnnotationRecord {
	id: string;
	x: number;
	y: number;
	entity: string | null;
	source: string | null;
	state: "open" | "acknowledged" | "resolved" | "dismissed";
	reason: string | null;
	beforeArtifact: string | null;
	afterArtifact: string | null;
	createdAt: number;
}

export interface MilestoneDecision {
	operationId: string;
	milestoneId: string;
	refuted: number;
	confirmed: number;
	supersedes: string | null;
	current: boolean;
	recordedAt: number;
}

export interface ComparisonRecord {
	id: string;
	beforeArtifact: string;
	afterArtifact: string;
	beforeCheckpoint: string | null;
	afterCheckpoint: string | null;
	measured: Array<{
		name: string;
		before: number | null;
		after: number | null;
		unit: string | null;
		note: string | null;
	}>;
	note: string | null;
	createdAt: number;
}

export interface GoldenRecord {
	name: string;
	artifact: string;
	recordedAt: number;
}

export interface RecordingIndexEntry {
	id: string;
	status: "pending-recording-capability" | "ready" | "expired";
	createdAt: number;
	note: string;
}

export interface DeliveryReceipt {
	id: string;
	action: "prepare" | "inspect" | "publish";
	status: "prepared" | "published" | "failed";
	sourceRevision: string | null;
	archiveDigest: string | null;
	reason: string | null;
	createdAt: number;
}

export interface ProjectRecord {
	cwd: string;
	name: string;
	substrate: Substrate | null;
	opening: OpeningRecord | null;
	stage: StageSnapshot;
	build: BuildSnapshot;
	annotations: AnnotationRecord[];
	milestoneDecisions: MilestoneDecision[];
	comparisons: ComparisonRecord[];
	goldens: GoldenRecord[];
	recordings: RecordingIndexEntry[];
	delivery: DeliveryReceipt[];
	updatedAt: number;
}

export function projectKey(cwd: string): string {
	return sha256Hex(cwd).slice(0, 24);
}

export function projectPath(cwd: string): string {
	return `projects/${projectKey(cwd)}.json`;
}

export function emptyProject(cwd: string, name = "game"): ProjectRecord {
	return {
		cwd,
		name,
		substrate: null,
		opening: null,
		stage: {
			running: false,
			url: null,
			port: null,
			tick: null,
			lastFrameAt: null,
			probeReady: false,
		},
		build: {
			status: "idle",
			command: null,
			exitCode: null,
			outputTail: "",
			startedAt: null,
			finishedAt: null,
		},
		annotations: [],
		milestoneDecisions: [],
		comparisons: [],
		goldens: [],
		recordings: [],
		delivery: [],
		updatedAt: Date.now(),
	};
}

export async function loadProject(storage: PluginStorageApi, cwd: string): Promise<ProjectRecord> {
	const data = await storage.readFile(projectPath(cwd), "utf8");
	if (data === null) return emptyProject(cwd);
	return JSON.parse(data) as ProjectRecord;
}

export async function saveProject(storage: PluginStorageApi, record: ProjectRecord): Promise<void> {
	record.updatedAt = Date.now();
	await storage.writeFile(projectPath(record.cwd), JSON.stringify(record, null, 2), "utf8");
}

export async function updateProject(
	storage: PluginStorageApi,
	cwd: string,
	patch: (record: ProjectRecord) => ProjectRecord | void,
): Promise<ProjectRecord> {
	const current = await loadProject(storage, cwd);
	const next = patch(current) ?? current;
	await saveProject(storage, next);
	return next;
}
