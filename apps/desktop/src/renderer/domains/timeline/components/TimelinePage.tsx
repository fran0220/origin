import { useTimelinePageModel } from "../hooks/useTimelinePageModel";
import { TimelinePageView } from "./TimelinePageView";

export function TimelinePage(): JSX.Element {
	const model = useTimelinePageModel();
	return (
		<TimelinePageView
			loading={model.loading}
			error={model.error}
			checkpoints={model.checkpoints}
			graph={model.graph}
			selected={model.selected}
			labels={model.labels}
			canRevert={model.canRevert}
			canRerun={model.canRerun}
			onSelect={model.select}
			onRevert={() => {
				void model.revertSelected();
			}}
			onRerun={() => {
				void model.rerunSelected();
			}}
		/>
	);
}
