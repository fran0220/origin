import { cloudLogoutAtom } from "@shared/store/auth-atoms";
import { showToast } from "@shared/store/toast-atoms";
import type { ConnectionReadState, CredentialOrigin, LiveQuota } from "@vetta/coding-agent/connections";
import { leavingActionFor } from "@vetta/coding-agent/connections";
import { useSetAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export interface ConnectionDraftForm {
	displayName: string;
	endpoint: string;
	protocol: string;
	secret: string;
}

export interface ConnectionsSettingsModel {
	connections: ConnectionReadState[];
	warning: string | null;
	adding: boolean;
	form: ConnectionDraftForm;
	saving: boolean;
	quotas: Record<string, LiveQuota>;
	setForm: React.Dispatch<React.SetStateAction<ConnectionDraftForm>>;
	onStartAdd: () => void;
	onCancelAdd: () => void;
	onSave: () => Promise<void>;
	onLeave: (state: ConnectionReadState) => Promise<void>;
	originLabel: (origin: CredentialOrigin) => string;
	leaveLabel: (origin: CredentialOrigin) => string;
	quotaLabel: (quota: LiveQuota | undefined) => string;
}

const EMPTY_FORM: ConnectionDraftForm = {
	displayName: "",
	endpoint: "",
	protocol: "openai",
	secret: "",
};

export function useConnectionsSettingsModel(): ConnectionsSettingsModel {
	const { t } = useTranslation("settings");
	const signOut = useSetAtom(cloudLogoutAtom);
	const [connections, setConnections] = useState<ConnectionReadState[]>([]);
	const [warning, setWarning] = useState<string | null>(null);
	const [adding, setAdding] = useState(false);
	const [form, setForm] = useState<ConnectionDraftForm>(EMPTY_FORM);
	const [saving, setSaving] = useState(false);
	const [quotas, setQuotas] = useState<Record<string, LiveQuota>>({});

	const reload = useCallback(async () => {
		const result = await window.vetta.connections.list();
		setConnections(result.connections);
		setWarning(result.warning?.message ?? null);
		const next: Record<string, LiveQuota> = {};
		await Promise.all(
			result.connections.map(async (state) => {
				next[state.descriptor.id] = await window.vetta.connections.quota(state.descriptor.id);
			}),
		);
		setQuotas(next);
	}, []);

	useEffect(() => {
		void reload().catch((error: unknown) => {
			console.warn("[connections] list failed:", error);
		});
	}, [reload]);

	const onSave = useCallback(async () => {
		setSaving(true);
		try {
			await window.vetta.connections.upsert({
				displayName: form.displayName,
				endpoint: form.endpoint,
				protocol: form.protocol,
				secret: form.secret,
				credentialOrigin: "provided",
			});
			setAdding(false);
			setForm(EMPTY_FORM);
			await reload();
		} catch (error) {
			showToast({
				title: t("connections.saveFailed"),
				description: error instanceof Error ? error.message : String(error),
				variant: "error",
			});
		} finally {
			setSaving(false);
		}
	}, [form, reload, t]);

	const onLeave = useCallback(
		async (state: ConnectionReadState) => {
			const action = leavingActionFor(state.descriptor.credentialOrigin);
			if (action === "sign-out") {
				signOut();
				await reload();
				return;
			}
			if (action === "remove") {
				await window.vetta.connections.remove(state.descriptor.id);
				await reload();
			}
		},
		[reload, signOut],
	);

	return {
		connections,
		warning,
		adding,
		form,
		saving,
		quotas,
		setForm,
		onStartAdd: () => setAdding(true),
		onCancelAdd: () => {
			setAdding(false);
			setForm(EMPTY_FORM);
		},
		onSave,
		onLeave,
		originLabel: (origin) => t(`connections.origin.${origin}`),
		leaveLabel: (origin) => {
			const action = leavingActionFor(origin);
			if (action === "sign-out") return t("connections.signOut");
			if (action === "remove") return t("connections.remove");
			return t("connections.managedElsewhere");
		},
		quotaLabel: (quota) => {
			if (!quota || quota.status === "unknown") return t("connections.quotaUnknown");
			return t("connections.quotaReadAt", { time: quota.readAt });
		},
	};
}
