import type { Api, Model } from "@vetta/ai";
import { getOrCreateSharedModelRuntime } from "../agent-runtime/host-services.js";

export async function resolveDesktopRecordingVideoModel(requested?: string): Promise<{
	readonly model: Model<Api>;
	readonly apiKey?: string;
}> {
	const runtime = getOrCreateSharedModelRuntime();
	const models = runtime.getAvailable();
	const match = requested
		? models.find((model) => model.id === requested || `${model.provider}/${model.id}` === requested)
		: models.find((model) => model.input.includes("video") || model.capabilities?.input.includes("video"));
	if (!match) {
		throw new Error(
			requested
				? `No video-capable model matching ${requested}`
				: "No video-capable model is configured. Add a Gemini model that declares video input.",
		);
	}
	if (!match.input.includes("video") && !match.capabilities?.input.includes("video")) {
		throw new Error(`Model ${match.provider}/${match.id} does not declare video input`);
	}
	return { model: match, apiKey: await runtime.getApiKey(match) };
}
