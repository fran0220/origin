import { isMac } from "@shared/lib/platform";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { WindowControlItem, WindowControlsModel } from "./types";

export function useWindowControlsModel(): WindowControlsModel {
	const { t } = useTranslation("common");
	const [isMaximized, setIsMaximized] = useState(false);

	useEffect(() => {
		if (isMac) return;

		void window.originApp.window.isMaximized().then(setIsMaximized);
		return window.originApp.window.onMaximizedChanged(setIsMaximized);
	}, []);

	const minimize = useCallback(() => {
		void window.originApp.window.minimize();
	}, []);

	const maximize = useCallback(async () => {
		await window.originApp.window.maximize();
		const maximized = await window.originApp.window.isMaximized();
		setIsMaximized(maximized);
	}, []);

	const close = useCallback(() => {
		void window.originApp.window.close();
	}, []);

	const controls: WindowControlItem[] = [
		{
			action: minimize,
			kind: "minimize",
			label: t("appShell.windowControls.minimize"),
		},
		{
			action: maximize,
			kind: isMaximized ? "restore" : "maximize",
			label: t(isMaximized ? "appShell.windowControls.restore" : "appShell.windowControls.maximize"),
		},
		{
			action: close,
			kind: "close",
			label: t("appShell.windowControls.close"),
		},
	];

	return {
		controls,
		isMac,
		isMaximized,
	};
}
