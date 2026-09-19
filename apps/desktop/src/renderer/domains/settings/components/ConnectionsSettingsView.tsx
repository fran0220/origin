import { Button, Input } from "@origin-org/ui";
import { useTranslation } from "react-i18next";
import { SETTINGS_SECTION } from "../registry";
import type { ConnectionsSettingsModel } from "./useConnectionsSettingsModel";

export function ConnectionsSettingsView({ model }: { model: ConnectionsSettingsModel }): JSX.Element {
	const { t } = useTranslation("settings");
	const section = SETTINGS_SECTION["connections-list"];

	return (
		<div className="mx-auto w-full max-w-[720px] px-8 pt-2 pb-10">
			<h1 className="mb-2 text-[22px] font-bold text-foreground">{t("tabConnections")}</h1>
			<p className="mb-6 text-[13px] text-muted-foreground">{t("connections.description")}</p>
			{model.warning && (
				<div className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200">
					{model.warning}
				</div>
			)}
			<section id={section.id} className="mb-6">
				<div className="mb-3 flex items-center justify-between">
					<h2 className="text-[15px] font-semibold">{t("section_connections-list")}</h2>
					{!model.adding && (
						<Button size="sm" onClick={model.onStartAdd}>
							{t("connections.add")}
						</Button>
					)}
				</div>
				{model.adding && (
					<div className="mb-4 space-y-3 rounded-lg border border-border p-4">
						<Input
							value={model.form.displayName}
							placeholder={t("connections.displayName")}
							onChange={(event) => model.setForm((current) => ({ ...current, displayName: event.target.value }))}
						/>
						<Input
							value={model.form.endpoint}
							placeholder={t("connections.endpoint")}
							onChange={(event) => model.setForm((current) => ({ ...current, endpoint: event.target.value }))}
						/>
						<Input
							value={model.form.protocol}
							placeholder={t("connections.protocol")}
							onChange={(event) => model.setForm((current) => ({ ...current, protocol: event.target.value }))}
						/>
						<Input
							type="password"
							value={model.form.secret}
							placeholder={t("connections.secret")}
							onChange={(event) => model.setForm((current) => ({ ...current, secret: event.target.value }))}
						/>
						<div className="flex gap-2">
							<Button size="sm" disabled={model.saving} onClick={() => void model.onSave()}>
								{model.saving ? t("saving") : t("save")}
							</Button>
							<Button size="sm" variant="ghost" onClick={model.onCancelAdd}>
								{t("cancel")}
							</Button>
						</div>
					</div>
				)}
				<div className="space-y-3">
					{model.connections.map((state) => {
						const quota = model.quotas[state.descriptor.id];
						return (
							<div
								key={state.descriptor.id}
								className="flex items-start justify-between gap-4 rounded-lg border border-border px-4 py-3"
							>
								<div className="min-w-0">
									<div className="truncate text-[14px] font-medium">{state.descriptor.displayName}</div>
									<div className="mt-1 text-[12px] text-muted-foreground">
										{model.originLabel(state.descriptor.credentialOrigin)} · {state.descriptor.endpoint}
									</div>
									{state.descriptor.account && (
										<div className="mt-1 text-[12px] text-muted-foreground">
											{state.descriptor.account.displayName}
											{state.descriptor.account.email ? ` · ${state.descriptor.account.email}` : ""}
										</div>
									)}
									<div className="mt-1 text-[11px] text-muted-foreground/80">{model.quotaLabel(quota)}</div>
								</div>
								{leavingVisible(state.descriptor.credentialOrigin) && (
									<Button size="sm" variant="ghost" onClick={() => void model.onLeave(state)}>
										{model.leaveLabel(state.descriptor.credentialOrigin)}
									</Button>
								)}
							</div>
						);
					})}
					{model.connections.length === 0 && !model.adding && (
						<p className="text-[13px] text-muted-foreground">{t("connections.empty")}</p>
					)}
				</div>
			</section>
		</div>
	);
}

function leavingVisible(origin: "signed-in" | "provided" | "env" | "command"): boolean {
	return origin === "signed-in" || origin === "provided";
}
