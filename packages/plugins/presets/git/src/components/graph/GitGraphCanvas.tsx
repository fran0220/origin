import { useTranslation } from "@origin-org/plugin-sdk";
import { GitGraphCanvas as SharedGitGraphCanvas } from "@origin-org/ui/git-graph";
import type { CommitNode } from "../../git/types";
import { CommitRow } from "./CommitRow";

export function GitGraphCanvas({
	nodes,
	selectedHash,
	onSelect,
	onReachEnd,
}: {
	nodes: readonly CommitNode[];
	selectedHash: string | null;
	onSelect: (hash: string) => void;
	onReachEnd?: () => void;
}): JSX.Element {
	const { locale } = useTranslation();
	return (
		<SharedGitGraphCanvas
			nodes={nodes}
			selectedHash={selectedHash}
			onSelect={onSelect}
			onReachEnd={onReachEnd}
			locale={locale}
			renderRow={({ node, selected, graphWidth, top, height, locale: rowLocale, onSelect: select }) => (
				<CommitRow
					node={node as CommitNode}
					selected={selected}
					graphWidth={graphWidth}
					top={top}
					height={height}
					locale={rowLocale}
					onSelect={select}
				/>
			)}
		/>
	);
}
