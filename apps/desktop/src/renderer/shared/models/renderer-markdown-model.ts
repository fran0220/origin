import type { TextBlockViewProps } from "@origin-org/theme-ui/chat";

export type RendererMarkdownModel = Pick<
	TextBlockViewProps,
	"theme" | "labels" | "getFileIconClass" | "onOpenFile" | "onOpenUrl"
>;
