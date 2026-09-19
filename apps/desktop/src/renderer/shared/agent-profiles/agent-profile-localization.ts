import type { AgentProfile, AgentProfileDocument } from "@origin/agent-profile";
import { languageAtom, type PluginI18nEntry, pluginI18nByIdAtom } from "@shared/store/atoms";
import { useAtomValue } from "jotai";
import { useCallback, useMemo } from "react";

type LocalizableResource = Pick<AgentProfile, "name" | "description" | "source">;

/**
 * 按当前界面语言解析插件提供的名称与描述。
 *
 * 档案里的 `name`/`description` 只存插件默认语言的字面量，模型看到的也是它；界面按 `source`
 * 上的语言包 key 现场查表。查不到（插件没加载、语言包缺这条）就沿用字面量——那正是默认语言的
 * 译文，比露出 key 强。没有可换的内容时原样返回同一个对象，下游的 memo 不会因此失效。
 */
export function localizeAgentProfileResource<T extends LocalizableResource>(
	resource: T,
	locale: string,
	catalogs: Readonly<Record<string, PluginI18nEntry>>,
): T {
	const source = resource.source;
	if (!source?.nameKey && !source?.descriptionKey) return resource;
	const catalog = catalogs[source.pluginId]?.locales[locale];
	if (!catalog) return resource;
	const name = (source.nameKey && catalog[source.nameKey]) || resource.name;
	const description = (source.descriptionKey && catalog[source.descriptionKey]) || resource.description;
	if (name === resource.name && description === resource.description) return resource;
	return { ...resource, name, description };
}

export function localizeAgentProfileDocument(
	document: AgentProfileDocument,
	locale: string,
	catalogs: Readonly<Record<string, PluginI18nEntry>>,
): AgentProfileDocument {
	const agents = document.agents.map((agent) => localizeAgentProfileResource(agent, locale, catalogs));
	const changed = agents.some((agent, index) => agent !== document.agents[index]);
	return changed ? { ...document, agents } : document;
}

/**
 * 界面展示用的文档：切换语言、插件语言包到位时自动重算。
 *
 * 只用于渲染。不要把结果写回会发往主进程的数据里——主进程侧的名字是默认语言的字面量。
 */
export function useLocalizedAgentProfileDocument(
	document: AgentProfileDocument | undefined,
): AgentProfileDocument | undefined {
	const locale = useAtomValue(languageAtom);
	const catalogs = useAtomValue(pluginI18nByIdAtom);
	return useMemo(
		() => (document ? localizeAgentProfileDocument(document, locale, catalogs) : undefined),
		[catalogs, document, locale],
	);
}

/** 命令式场景（effect 里拉到文档再用）拿的解析函数；语言变化时函数身份随之改变。 */
export function useAgentProfileResourceLocalizer(): <T extends LocalizableResource>(resource: T) => T {
	const locale = useAtomValue(languageAtom);
	const catalogs = useAtomValue(pluginI18nByIdAtom);
	return useCallback((resource) => localizeAgentProfileResource(resource, locale, catalogs), [catalogs, locale]);
}
