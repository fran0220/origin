import { Outlet, useNavigate } from "@tanstack/react-router";
import { DeferredSurface } from "@shared/components/DeferredSurface";
import { TitledPageShell } from "@shared/components/TitledPageShell";
import { keepAliveShouldStackLeave } from "@shared/components/deferred-surface-display";
import { useSurfacePageReady } from "@shared/hooks/useSurfacePageReady";
import { PluginWorkspaceViewSurface } from "../domains/plugins/components/PluginWorkspaceViewRoute";
import { lazy, Suspense, useCallback, useState, type ComponentType, type JSX, type LazyExoticComponent } from "react";
import { useTranslation } from "react-i18next";
import { ChatSurface } from "./ChatSurface";
import { ChatSurfaceShell } from "./ChatSurfaceShell";
import { DeferredChatSurface } from "./DeferredChatSurface";
import {
	detailSurfaceForPath,
	projectDetailShellTitle,
	rememberVisitedDetail,
	type DetailSurfaceRef,
} from "./detail-surface";
import { incomingKeepAliveAlreadyMounted } from "./keep-alive-incoming";
import {
	loadProjectDetailPage,
	loadSessionViewerPage,
	loadThemePageRoute,
} from "./outlet-page-loaders";
import { PersistentSurfaceShell } from "./PersistentSurfaceShell";
import { ThemePageRouteShell } from "../shared/theme/pages/ThemePageRouteShell";
import {
	loadAbilitiesPage,
	loadAgentsPage,
	loadAutomationPage,
	loadBatchTasksPage,
	loadEvaluationPage,
	loadTimelinePage,
	loadChatPage,
	loadKnowledgeListPage,
	loadKnowledgePage,
	loadNewSessionPage,
	loadScenesPage,
	loadSettingsPage,
} from "./persistent-page-loaders";
import {
	persistentSurfaceIdForPath,
	rememberVisitedSurface,
	type PersistentSurfaceId,
} from "./persistent-surface";
import {
	rememberVisitedWorkspace,
	workspaceSurfaceForPath,
	type WorkspaceSurfaceRef,
} from "./workspace-surface";

const SettingsPage = lazy(loadSettingsPage);
const AbilitiesPage = lazy(loadAbilitiesPage);
const AgentsPage = lazy(loadAgentsPage);
const AutomationPage = lazy(loadAutomationPage);
const BatchTasksPage = lazy(loadBatchTasksPage);
const EvaluationPage = lazy(loadEvaluationPage);
const TimelinePage = lazy(loadTimelinePage);
const KnowledgePage = lazy(loadKnowledgePage);
const KnowledgeListPage = lazy(loadKnowledgeListPage);
const ScenesPage = lazy(loadScenesPage);
const NewSessionPage = lazy(loadNewSessionPage);
const ProjectDetailPage = lazy(loadProjectDetailPage) as LazyExoticComponent<ComponentType<{ cwd?: string }>>;
const SessionViewerPage = lazy(loadSessionViewerPage) as LazyExoticComponent<ComponentType<{ path?: string }>>;
const ThemePageRoute = lazy(loadThemePageRoute) as LazyExoticComponent<
	ComponentType<{ themeId?: string; pageId?: string }>
>;

const PAGE_BY_SURFACE: Record<
	Exclude<PersistentSurfaceId, "chat">,
	LazyExoticComponent<ComponentType>
> = {
	abilities: AbilitiesPage,
	agents: AgentsPage,
	automation: AutomationPage,
	"batch-tasks": BatchTasksPage,
	evaluation: EvaluationPage,
	timeline: TimelinePage,
	knowledge: KnowledgePage,
	"knowledge-all": KnowledgeListPage,
	"new-session": NewSessionPage,
	scenes: ScenesPage,
	settings: SettingsPage,
};

const LOAD_BY_SURFACE: Record<Exclude<PersistentSurfaceId, "chat">, () => Promise<unknown>> = {
	abilities: loadAbilitiesPage,
	agents: loadAgentsPage,
	automation: loadAutomationPage,
	"batch-tasks": loadBatchTasksPage,
	evaluation: loadEvaluationPage,
	timeline: loadTimelinePage,
	knowledge: loadKnowledgePage,
	"knowledge-all": loadKnowledgeListPage,
	"new-session": loadNewSessionPage,
	scenes: loadScenesPage,
	settings: loadSettingsPage,
};

function PersistentPage({
	active,
	id,
	Page,
	stackLeave,
}: {
	active: boolean;
	id: Exclude<PersistentSurfaceId, "chat">;
	Page: LazyExoticComponent<ComponentType>;
	stackLeave: boolean;
}): JSX.Element {
	const ready = useSurfacePageReady(active, LOAD_BY_SURFACE[id]);
	return (
		<DeferredSurface active={active} name={id} stackLeave={stackLeave}>
			{ready ? (
				<Suspense fallback={<PersistentSurfaceShell id={id} />}>
					<Page />
				</Suspense>
			) : (
				<PersistentSurfaceShell id={id} />
			)}
		</DeferredSurface>
	);
}

function PersistentChatPage({ active, stackLeave }: { active: boolean; stackLeave: boolean }): JSX.Element {
	const ready = useSurfacePageReady(active, loadChatPage);
	return (
		<DeferredChatSurface active={active} stackLeave={stackLeave}>
			{ready ? <ChatSurface /> : <ChatSurfaceShell />}
		</DeferredChatSurface>
	);
}

function PersistentWorkspacePage({
	active,
	pluginId,
	viewId,
	stackLeave,
}: {
	active: boolean;
	pluginId: string;
	viewId: string;
	stackLeave: boolean;
}): JSX.Element {
	const navigate = useNavigate();
	const onMissing = useCallback(() => {
		void navigate({ to: "/", replace: true });
	}, [navigate]);
	return (
		<DeferredSurface active={active} name={`workspace:${pluginId}/${viewId}`} stackLeave={stackLeave}>
			<PluginWorkspaceViewSurface pluginId={pluginId} viewId={viewId} onMissing={onMissing} active={active} />
		</DeferredSurface>
	);
}

function DetailSurfaceShell({ item }: { item: DetailSurfaceRef }): JSX.Element {
	const common = useTranslation("common");
	const chat = useTranslation("chat");
	if (item.kind === "project") {
		return <TitledPageShell title={projectDetailShellTitle(item.cwd, common.t("appShell.routeTitles.project"))} />;
	}
	if (item.kind === "viewer") {
		return <TitledPageShell title={chat.t("sessionViewer.export.defaultTitle")} />;
	}
	return <ThemePageRouteShell themeId={item.themeId} pageId={item.pageId} />;
}

function PersistentDetailPage({
	active,
	item,
	stackLeave,
}: {
	active: boolean;
	item: DetailSurfaceRef;
	stackLeave: boolean;
}): JSX.Element {
	const load =
		item.kind === "project"
			? loadProjectDetailPage
			: item.kind === "viewer"
				? loadSessionViewerPage
				: loadThemePageRoute;
	const ready = useSurfacePageReady(active, load);
	const fallback = <DetailSurfaceShell item={item} />;
	return (
		<DeferredSurface active={active} name={`detail:${item.key}`} stackLeave={stackLeave}>
			{ready ? (
				<Suspense fallback={fallback}>
					{item.kind === "project" ? (
						<ProjectDetailPage cwd={item.cwd} />
					) : item.kind === "viewer" ? (
						<SessionViewerPage path={item.path} />
					) : (
						<ThemePageRoute themeId={item.themeId} pageId={item.pageId} />
					)}
				</Suspense>
			) : (
				fallback
			)}
		</DeferredSurface>
	);
}

export interface PersistentRouteStageProps {
	currentPath: string;
}

/**
 * 侧栏主页面的工作台：已访问过的入口保活，当前入口占 flex-1。
 * 第一次走进时离场页叠一帧再 hidden；切回已挂载页则立刻 hidden，不盖住目标标题。
 * 未登记的路由仍走 Outlet（重定向 / 错误页）。插件工作区、项目详情 / 查看器 / 主题页按 LRU 保活。
 */
export function PersistentRouteStage({ currentPath }: PersistentRouteStageProps): JSX.Element {
	const surface = persistentSurfaceIdForPath(currentPath);
	const workspace = workspaceSurfaceForPath(currentPath);
	const detail = detailSurfaceForPath(currentPath);
	const [visited, setVisited] = useState<ReadonlySet<PersistentSurfaceId>>(() =>
		surface ? new Set<PersistentSurfaceId>([surface]) : new Set(),
	);
	const [visitedWorkspaces, setVisitedWorkspaces] = useState<readonly WorkspaceSurfaceRef[]>(() =>
		workspace ? [workspace] : [],
	);
	const [visitedDetails, setVisitedDetails] = useState<readonly DetailSurfaceRef[]>(() => (detail ? [detail] : []));
	const nextVisited = rememberVisitedSurface(visited, surface);
	if (nextVisited !== visited) setVisited(nextVisited);
	const nextWorkspaces = rememberVisitedWorkspace(visitedWorkspaces, workspace);
	if (nextWorkspaces !== visitedWorkspaces) setVisitedWorkspaces(nextWorkspaces);
	const nextDetails = rememberVisitedDetail(visitedDetails, detail);
	if (nextDetails !== visitedDetails) setVisitedDetails(nextDetails);

	const keepAlive = surface !== null || workspace !== null || detail !== null;
	const overlayLeave = keepAliveShouldStackLeave(
		incomingKeepAliveAlreadyMounted({
			surface,
			visited,
			workspace,
			visitedWorkspaces,
			detail,
			visitedDetails,
		}),
	);

	return (
		<>
			{visited.has("chat") ? <PersistentChatPage active={surface === "chat"} stackLeave={overlayLeave} /> : null}
			{(Object.keys(PAGE_BY_SURFACE) as Exclude<PersistentSurfaceId, "chat">[]).map((id) =>
				visited.has(id) ? (
					<PersistentPage
						key={id}
						active={surface === id}
						id={id}
						Page={PAGE_BY_SURFACE[id]}
						stackLeave={overlayLeave}
					/>
				) : null,
			)}
			{visitedWorkspaces.map((item) => (
				<PersistentWorkspacePage
					key={item.key}
					active={workspace?.key === item.key}
					pluginId={item.pluginId}
					viewId={item.viewId}
					stackLeave={overlayLeave}
				/>
			))}
			{visitedDetails.map((item) => (
				<PersistentDetailPage
					key={item.key}
					active={detail?.key === item.key}
					item={item}
					stackLeave={overlayLeave}
				/>
			))}
			{keepAlive ? null : <Outlet />}
		</>
	);
}
