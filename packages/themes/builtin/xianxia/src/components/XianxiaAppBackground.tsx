import { useSystemInfo } from "@origin-org/theme-sdk";
import { AppBackground, type AppBackgroundProps } from "@origin-org/theme-ui";
import { cn } from "@origin-org/ui";
import type { JSX } from "react";

export function XianxiaAppBackground({
	className,
	...props
}: AppBackgroundProps): JSX.Element {
	const systemInfo = useSystemInfo();

	return (
		<AppBackground
			className={cn(className, systemInfo.isMac && "xianxia-app-background-edge-to-edge")}
			{...props}
		/>
	);
}
