import type { AgentProfile } from "@origin/agent-team";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { AgentConstellation } from "./AgentConstellation";

const easeOut = [0.22, 1, 0.36, 1] as const;

export interface AgentCenterHeroProps {
	/** 只作装饰：取前几位头像挂到标题下方的弧线上。 */
	readonly agents: readonly AgentProfile[];
}

/** 页面顶部：标题、说明与头像装饰直接落在页面底色上，随内容一起滚动。 */
export function AgentCenterHero(props: AgentCenterHeroProps): JSX.Element {
	const { t } = useTranslation("agent-teams");

	return (
		<motion.header
			className="shrink-0 pb-5 pt-4 @md:pb-6"
			initial={false}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.45, ease: easeOut }}
		>
			<div className="flex min-w-0 flex-wrap items-start justify-between gap-x-6 gap-y-4">
				<div className="min-w-0 flex-1 basis-[12rem]">
					<h1 className="mb-1 min-w-0 truncate text-[20px] font-bold leading-tight tracking-tight text-foreground @md:text-[26px]">
						{t("center.title")}
					</h1>
					<p className="min-w-0 truncate text-[11.5px] text-muted-foreground/70">{t("center.subtitle")}</p>
					<div className="mt-3.5">
						<AgentConstellation agents={props.agents} />
					</div>
				</div>
			</div>
		</motion.header>
	);
}
