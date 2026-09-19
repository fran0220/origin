/** 把另一 Thread 的投递格式化为本 Thread 的用户可见消息。不携带文件。 */
export function formatInboundThreadMessage(fromThreadId: string, message: string): string {
	return [`<thread_message from="${fromThreadId}">`, message.trim(), "</thread_message>"].join("\n");
}

export function parseInboundThreadMessage(
	text: string,
): { readonly fromThreadId: string; readonly message: string } | undefined {
	const match = text.trim().match(/^<thread_message from="([^"]+)">\n?([\s\S]*)<\/thread_message>$/u);
	if (!match) return undefined;
	return { fromThreadId: match[1] ?? "", message: (match[2] ?? "").trim() };
}
