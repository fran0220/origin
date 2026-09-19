import type { ChatToolCallPresentationViewModel, ToolCallBlock } from "@shared/store/atoms";
import { memo } from "react";
import { ToolCallBlockView } from "../blocks/ToolCallBlock";

interface ToolCallPresentationProps {
	readonly block: ToolCallBlock;
	readonly presentation?: ChatToolCallPresentationViewModel;
	readonly exportMode?: boolean;
	readonly aliased?: boolean;
}

/**
 * Message recipe for a tool row. Raw tool details keep their own disclosure behavior.
 */
export const ToolCallPresentation = memo(function ToolCallPresentation({
	block,
	presentation,
	exportMode = false,
	aliased = false,
}: ToolCallPresentationProps): JSX.Element {
	void presentation;
	return (
		<div className="min-w-0 w-full">
			<ToolCallBlockView block={block} exportMode={exportMode} aliased={aliased} />
		</div>
	);
});
