import { useTranslation } from "react-i18next";
import { RecordingPanel } from "../components/RecordingPanel";
import type { ActivityTabDefinition } from "../registry/types";

function RecordingActivityTab(): JSX.Element {
	return <RecordingPanel />;
}

export const recordingTabDefinition: ActivityTabDefinition = {
	id: "recording",
	order: 25,
	removable: true,
	source: "builtin",
	retention: "pinned",
	useMeta: () => {
		const { t } = useTranslation("recording");
		return {
			label: t("tab"),
			icon: "icon-[mdi--record-rec]",
		};
	},
	component: RecordingActivityTab,
};
