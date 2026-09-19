import type {
	AgentBlueprint,
	AgentProfile,
	AgentProfileDocument,
	CreateAgentProfileInput,
	DeleteAgentProfileInput,
	UpdateAgentProfileInput,
} from "@vetta/agent-team";

export interface DesktopAgentTeamsApi {
	list(): Promise<AgentProfileDocument>;
	/**
	 * 订阅「配置被主进程改过」：插件装卸、启停与开发态热重载会在用户没动手时重铺插件预设。
	 *
	 * 事件不带文档，收到后自行 `list()`：一份完整配置每次都过 IPC 不值得，而这条事件本就少见。
	 */
	onChanged(listener: () => void): () => void;
	listBlueprints(): Promise<readonly AgentBlueprint[]>;
	createAgent(input: CreateAgentProfileInput): Promise<AgentProfile>;
	updateAgent(id: string, input: UpdateAgentProfileInput): Promise<AgentProfile>;
	deleteAgent(id: string, input: DeleteAgentProfileInput): Promise<void>;
	/** 弹出图片选择框，返回可直接作为 `<img src>` 的头像 URL；用户取消时返回 undefined。 */
	uploadAvatar(): Promise<string | undefined>;
}
