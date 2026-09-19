// @vitest-environment jsdom

import { parseConnectionEndpoint } from "@origin/coding-agent/connections";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConnectionsSettingsView } from "./ConnectionsSettingsView";
import type { ConnectionsSettingsModel } from "./useConnectionsSettingsModel";

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}));

vi.mock("@origin-org/ui", () => ({
	Button: ({ children, onClick, disabled }: { children: string; onClick?: () => void; disabled?: boolean }) => (
		<button type="button" onClick={onClick} disabled={disabled}>
			{children}
		</button>
	),
	Input: ({
		value,
		placeholder,
		onChange,
		type,
	}: {
		value: string;
		placeholder?: string;
		onChange?: (event: { target: { value: string } }) => void;
		type?: string;
	}) => <input value={value} placeholder={placeholder} type={type} onChange={onChange} />,
}));

function model(overrides: Partial<ConnectionsSettingsModel> = {}): ConnectionsSettingsModel {
	return {
		connections: [
			{
				descriptor: {
					id: "origin",
					displayName: "Origin",
					protocol: "openai",
					endpoint: parseConnectionEndpoint("https://api.example.com"),
					credentialOrigin: "signed-in",
					account: { subject: "1", username: "alice", displayName: "Alice" },
				},
				status: "ready",
				credentialState: "available",
				credentialCustody: "os-protected",
				credentialEpoch: 1,
				updatedAt: "2026-01-01T00:00:00.000Z",
			},
			{
				descriptor: {
					id: "openai",
					displayName: "OpenAI",
					protocol: "openai",
					endpoint: parseConnectionEndpoint("https://api.openai.com"),
					credentialOrigin: "provided",
				},
				status: "ready",
				credentialState: "available",
				credentialCustody: "os-protected",
				credentialEpoch: 1,
				updatedAt: "2026-01-01T00:00:00.000Z",
			},
		],
		warning: null,
		adding: false,
		form: { displayName: "", endpoint: "", protocol: "openai", secret: "" },
		saving: false,
		quotas: {
			origin: { status: "unknown", readAt: "2026-01-01T00:00:00.000Z" },
			openai: { status: "ok", readAt: "2026-01-01T00:00:00.000Z" },
		},
		setForm: vi.fn(),
		onStartAdd: vi.fn(),
		onCancelAdd: vi.fn(),
		onSave: vi.fn(async () => undefined),
		onLeave: vi.fn(async () => undefined),
		originLabel: (origin) => `origin:${origin}`,
		leaveLabel: (origin) => (origin === "signed-in" ? "connections.signOut" : "connections.remove"),
		quotaLabel: (quota) => (quota?.status === "unknown" ? "connections.quotaUnknown" : "connections.quotaReadAt"),
		...overrides,
	};
}

describe("ConnectionsSettingsView", () => {
	it("列出连接来源、配额时间，并区分 Sign out 与 Remove", async () => {
		const current = model();
		render(<ConnectionsSettingsView model={current} />);
		expect(screen.getByText("Origin")).toBeTruthy();
		expect(screen.getByText(/origin:signed-in/)).toBeTruthy();
		expect(screen.getByText("connections.signOut")).toBeTruthy();
		expect(screen.getByText("connections.remove")).toBeTruthy();
		expect(screen.getByText("connections.quotaUnknown")).toBeTruthy();
		await userEvent.click(screen.getByText("connections.signOut"));
		expect(current.onLeave).toHaveBeenCalledOnce();
	});
});
