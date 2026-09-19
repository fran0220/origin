export const WAIT_AGENT_TOOL_DESCRIPTION =
	"Wait until one or more in-thread specialists reach a terminal state. Event-driven (no polling). Consumes the completion so a <subagent_notification> will not re-deliver the same result. " +
	"Independent work that lives in another conversation belongs in create_thread / wait_for_threads, not here.";
