import { definePlugin } from "@vetta-org/plugin-sdk";
import { type ComponentType, type ReactElement, lazy, Suspense } from "react";
import "./style.css";
import {
	BOARD_VIEW_ID,
	BUILD_CARD_TYPE,
	BUILD_TAB_ID,
	GAME_DIRECTOR_AGENT_ID,
	GRAPH_TAB_ID,
	MAP_VIEW_ID,
	RECORDINGS_TAB_ID,
	STAGE_CARD_TYPE,
	STAGE_TAB_ID,
} from "./ids";
import { persistDefaultSettings } from "./mcp/defaults";
import { clearPluginCtx, setPluginCtx } from "./plugin-context";
import { stopAllDevServers, stopDevServer } from "./stage/dev-server";
import { registerGameStudioTools } from "./tools/register";

function lazySurface<P extends object>(load: () => Promise<{ default: ComponentType<P> }>): (props: P) => ReactElement {
	const Lazy = lazy(load);
	return function LazyPluginSurface(props: P) {
		return (
			<Suspense fallback={null}>
				<Lazy {...props} />
			</Suspense>
		);
	};
}

const BoardView = lazySurface(async () => ({ default: (await import("./ui/BoardView")).BoardView }));
const MapView = lazySurface(async () => ({ default: (await import("./ui/MapView")).MapView }));
const StageTab = lazySurface(async () => ({ default: (await import("./ui/StageTab")).StageTab }));
const GraphTab = lazySurface(async () => ({ default: (await import("./ui/GraphTab")).GraphTab }));
const BuildTab = lazySurface(async () => ({ default: (await import("./ui/BuildTab")).BuildTab }));
const RecordingsTab = lazySurface(async () => ({ default: (await import("./ui/RecordingsTab")).RecordingsTab }));
const StageCard = lazySurface(async () => ({ default: (await import("./ui/StageCard")).StageCard }));
const BuildCard = lazySurface(async () => ({ default: (await import("./ui/BuildCard")).BuildCard }));
const NewSession = lazy(() =>
	import("./ui/NewSessionContext").then((module) => ({ default: module.NewSessionContext })),
);

export default definePlugin({
	activate(ctx) {
		setPluginCtx(ctx);
		ctx.ui.registerWorkspaceView({
			id: BOARD_VIEW_ID,
			label: "%board.title%",
			icon: "icon-[solar--gamepad-linear]",
			description: "%board.subtitle%",
			component: BoardView,
		});
		ctx.ui.registerWorkspaceView({
			id: MAP_VIEW_ID,
			label: "%map.title%",
			icon: "icon-[solar--map-linear]",
			description: "%map.subtitle%",
			component: MapView,
		});
		ctx.ui.registerActivityTab({
			id: STAGE_TAB_ID,
			label: "%tab.stage%",
			component: StageTab,
			scope_use: ["project", "conversation"],
			initiallyVisible: true,
		});
		ctx.ui.registerActivityTab({
			id: GRAPH_TAB_ID,
			label: "%tab.graph%",
			component: GraphTab,
			scope_use: ["project", "conversation"],
			initiallyVisible: true,
		});
		ctx.ui.registerActivityTab({
			id: BUILD_TAB_ID,
			label: "%tab.build%",
			component: BuildTab,
			scope_use: ["project", "conversation"],
			initiallyVisible: true,
		});
		ctx.ui.registerActivityTab({
			id: RECORDINGS_TAB_ID,
			label: "%tab.recordings%",
			component: RecordingsTab,
			scope_use: ["project", "conversation"],
			initiallyVisible: true,
		});
		ctx.ui.registerCardRenderer({
			type: STAGE_CARD_TYPE,
			component: StageCard,
			title: "%card.stage.title%",
		});
		ctx.ui.registerCardRenderer({
			type: BUILD_CARD_TYPE,
			component: BuildCard,
			title: "%card.build.title%",
		});
		ctx.ui.registerNewSessionContext({
			id: "game-opening",
			label: "%plugin.name%",
			activateWhen: { agents: [GAME_DIRECTOR_AGENT_ID] },
			width: "wide",
			render: (context) => <NewSession context={context} />,
		});
		registerGameStudioTools(ctx);
		void persistDefaultSettings(ctx.storage);
		ctx.agent.registerHook({
			id: "origin-game-studio.stop-stage",
			eventName: "SessionEnd",
			scope_use: ["project", "conversation"],
			handler: async ({ session }) => {
				await stopDevServer(ctx, session.cwd);
			},
		});
	},
	deactivate() {
		clearPluginCtx();
		void stopAllDevServers();
	},
});
