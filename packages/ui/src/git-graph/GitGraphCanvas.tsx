import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { computeGraphLayout, type GraphLine } from "./graphLayout";
import type { GraphCommitNode, GraphFeedbackEdge, GraphHostMode } from "./types";
import { useHostMode } from "./useHostMode";

const ROW_HEIGHT = 24;
const LANE_WIDTH = 12;
const LEFT_PADDING = 12;
const CIRCLE_RADIUS = 3.5;
const CIRCLE_STROKE = 1.5;
const LINE_WIDTH = 1.5;
const CURVE_H = ROW_HEIGHT / 3;
const CURVE_W = LANE_WIDTH / 3;
const DOT_SHIFT = CIRCLE_RADIUS + CIRCLE_STROKE;
const OVERSCAN = 8;
const REACH_END_ROWS = 16;

const LANE_COLORS: Record<GraphHostMode, string[]> = {
	dark: ["#60a5fa", "#34d399", "#fbbf24", "#f472b6", "#a78bfa", "#22d3ee", "#fb923c", "#a3e635"],
	light: ["#2563eb", "#059669", "#d97706", "#db2777", "#7c3aed", "#0891b2", "#ea580c", "#65a30d"],
};
const COLORS_COUNT = LANE_COLORS.dark.length;
const FEEDBACK_COLOR: Record<GraphHostMode, string> = {
	dark: "#f87171",
	light: "#dc2626",
};

const laneCenterX = (lane: number): number => LEFT_PADDING + lane * LANE_WIDTH + LANE_WIDTH / 2;
const rowCenterY = (row: number): number => row * ROW_HEIGHT + ROW_HEIGHT / 2;

function linePath(line: GraphLine): string {
	const startX = laneCenterX(line.childColumn);
	let curX = startX;
	let curY = rowCenterY(line.startRow) + CIRCLE_RADIUS;
	let d = `M${startX} ${curY}`;
	const segs = line.segments;

	segs.forEach((seg, i) => {
		const isLast = i === segs.length - 1;
		if (seg.kind === "straight") {
			let destY = rowCenterY(seg.toRow);
			if (isLast) destY -= CIRCLE_RADIUS;
			d += `L${curX} ${destY}`;
			curY = destY;
			return;
		}

		let toColX = laneCenterX(seg.toColumn);
		let toRowY = rowCenterY(seg.onRow);
		const goingRight = toColX > curX;
		const shift = goingRight ? DOT_SHIFT : -DOT_SHIFT;

		if (seg.curve === "checkout") {
			if (isLast) toColX -= shift;
			const cw = Math.min(CURVE_W, Math.abs(toColX - curX));
			const ch = Math.min(CURVE_H, Math.abs(toRowY - curY));
			const scw = goingRight ? cw : -cw;
			d += `L${curX} ${toRowY - ch}Q${curX} ${toRowY} ${curX + scw} ${toRowY}L${toColX} ${toRowY}`;
		} else {
			if (isLast) toRowY -= CIRCLE_RADIUS;
			const msX = curX + shift;
			const msY = curY - CIRCLE_RADIUS;
			const cw = Math.min(CURVE_W, Math.abs(toColX - msX));
			const ch = Math.min(CURVE_H, Math.abs(toRowY - msY));
			const scw = goingRight ? cw : -cw;
			d += `M${msX} ${msY}L${toColX - scw} ${msY}Q${toColX} ${msY} ${toColX} ${msY + ch}L${toColX} ${toRowY}`;
		}
		curX = toColX;
		curY = toRowY;
	});

	return d;
}

function feedbackPath(fromRow: number, fromLane: number, toRow: number, toLane: number): string {
	const x1 = laneCenterX(fromLane);
	const y1 = rowCenterY(fromRow);
	const x2 = laneCenterX(toLane);
	const y2 = rowCenterY(toRow);
	const midY = (y1 + y2) / 2;
	const bulge = LANE_WIDTH * 2.5;
	return `M${x1} ${y1} C${x1 + bulge} ${midY} ${x2 + bulge} ${midY} ${x2} ${y2}`;
}

export interface GitGraphRowRenderContext {
	readonly node: GraphCommitNode;
	readonly selected: boolean;
	readonly graphWidth: number;
	readonly top: number;
	readonly height: number;
	readonly locale: string;
	readonly onSelect: (hash: string) => void;
}

export interface GitGraphCanvasProps {
	readonly nodes: readonly GraphCommitNode[];
	readonly selectedHash: string | null;
	readonly onSelect: (hash: string) => void;
	readonly onReachEnd?: () => void;
	readonly locale?: string;
	readonly feedbackEdges?: readonly GraphFeedbackEdge[];
	readonly renderRow?: (context: GitGraphRowRenderContext) => ReactNode;
	readonly title?: string;
}

export function GitGraphCanvas({
	nodes,
	selectedHash,
	onSelect,
	onReachEnd,
	locale = "en",
	feedbackEdges = [],
	renderRow,
	title = "git graph",
}: GitGraphCanvasProps): JSX.Element {
	const mode = useHostMode();
	const layout = useMemo(() => computeGraphLayout(nodes, COLORS_COUNT), [nodes]);
	const scrollRef = useRef<HTMLDivElement>(null);
	const onReachEndRef = useRef(onReachEnd);
	onReachEndRef.current = onReachEnd;
	const [view, setView] = useState({ top: 0, height: 0 });

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		const sync = (): void => setView({ top: el.scrollTop, height: el.clientHeight });
		sync();
		const ro = new ResizeObserver(sync);
		ro.observe(el);
		let raf = 0;
		const onScroll = (): void => {
			if (raf) return;
			raf = requestAnimationFrame(() => {
				raf = 0;
				setView({ top: el.scrollTop, height: el.clientHeight });
				if (el.scrollHeight - el.scrollTop - el.clientHeight < ROW_HEIGHT * REACH_END_ROWS) onReachEndRef.current?.();
			});
		};
		el.addEventListener("scroll", onScroll, { passive: true });
		return () => {
			ro.disconnect();
			el.removeEventListener("scroll", onScroll);
			if (raf) cancelAnimationFrame(raf);
		};
	}, []);

	const colors = LANE_COLORS[mode];
	const totalHeight = nodes.length * ROW_HEIGHT;
	const first = Math.max(0, Math.floor(view.top / ROW_HEIGHT) - OVERSCAN);
	const last = Math.min(nodes.length - 1, Math.ceil((view.top + view.height) / ROW_HEIGHT) + OVERSCAN);
	const visibleLines = layout.lines.filter((l) => l.startRow <= last && l.endRow >= first);
	const visibleDots = layout.commits.filter((c) => c.row >= first && c.row <= last);
	const visibleRows: number[] = [];
	for (let i = first; i <= last; i++) visibleRows.push(i);

	let visMaxLane = 0;
	for (const c of visibleDots) if (c.lane > visMaxLane) visMaxLane = c.lane;
	for (const l of visibleLines) {
		if (l.childColumn > visMaxLane) visMaxLane = l.childColumn;
		for (const s of l.segments) if (s.kind === "curve" && s.toColumn > visMaxLane) visMaxLane = s.toColumn;
	}
	const graphWidth = laneCenterX(visMaxLane) + LANE_WIDTH;
	const rowByHash = new Map(layout.commits.map((commit) => [commit.hash, commit] as const));
	const visibleFeedback = feedbackEdges.filter((edge) => {
		const from = rowByHash.get(edge.fromHash);
		const to = rowByHash.get(edge.toHash);
		if (!from || !to) return false;
		const minRow = Math.min(from.row, to.row);
		const maxRow = Math.max(from.row, to.row);
		return minRow <= last && maxRow >= first;
	});

	return (
		<div ref={scrollRef} className="git-graph-canvas relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
			<svg className="pointer-events-none absolute left-0 top-0" width={graphWidth} height={totalHeight} aria-hidden>
				<title>{title}</title>
				{visibleLines.map((line) => (
					<path
						key={`${line.childColumn}_${line.startRow}_${line.endRow}`}
						d={linePath(line)}
						fill="none"
						stroke={colors[line.colorIdx % colors.length]}
						strokeWidth={LINE_WIDTH}
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				))}
				{visibleFeedback.map((edge) => {
					const from = rowByHash.get(edge.fromHash);
					const to = rowByHash.get(edge.toHash);
					if (!from || !to) return null;
					return (
						<path
							key={`feedback_${edge.fromHash}_${edge.toHash}`}
							d={feedbackPath(from.row, from.lane, to.row, to.lane)}
							fill="none"
							stroke={FEEDBACK_COLOR[mode]}
							strokeWidth={LINE_WIDTH}
							strokeDasharray="4 3"
							strokeLinecap="round"
						/>
					);
				})}
				{visibleDots.map((c) => (
					<circle
						key={c.hash}
						cx={laneCenterX(c.lane)}
						cy={rowCenterY(c.row)}
						r={CIRCLE_RADIUS}
						fill={colors[c.colorIdx % colors.length]}
						stroke="var(--muted)"
						strokeWidth={1}
					/>
				))}
			</svg>
			<div className="relative" style={{ height: totalHeight }}>
				{visibleRows.map((i) => {
					const node = nodes[i];
					if (!node) return null;
					if (renderRow) {
						return (
							<Fragment key={node.hash}>
								{renderRow({
									node,
									selected: node.hash === selectedHash,
									graphWidth,
									top: i * ROW_HEIGHT,
									height: ROW_HEIGHT,
									locale,
									onSelect,
								})}
							</Fragment>
						);
					}
					return (
						<button
							key={node.hash}
							type="button"
							onClick={() => onSelect(node.hash)}
							style={{ position: "absolute", top: i * ROW_HEIGHT, height: ROW_HEIGHT, left: graphWidth, right: 0 }}
							className={`flex items-center truncate px-2 text-left text-[12px] ${
								node.hash === selectedHash ? "bg-accent text-foreground" : "text-foreground hover:bg-accent"
							}`}
						>
							{node.subject ?? node.hash}
						</button>
					);
				})}
			</div>
		</div>
	);
}
