import type { ModelCallRequest } from "../../runtime/language-model-adapter.js";
import { createGoogleSdkAdapter, type GoogleGenerateContentSender } from "../google-stream/adapter.js";
import { createGoogleClient } from "./client.js";
import type { GoogleOptions } from "./options.js";
import { buildGoogleParams } from "./request.js";
import { createGeminiFileUploader, materializeGeminiVideoUploads } from "./video-upload.js";

export type GoogleContentSender = GoogleGenerateContentSender<"google-generative-ai", GoogleOptions>;

export interface GoogleAdapterDependencies {
	readonly send?: GoogleContentSender;
}

const sendGoogleContent: GoogleContentSender = async (params, request) => {
	return await createGoogleClient(request).models.generateContentStream(params);
};

export const googleAdapter = createGoogleAdapter();

export function createGoogleAdapter(dependencies: GoogleAdapterDependencies = {}) {
	const inner = createGoogleSdkAdapter({
		api: "google-generative-ai",
		buildParams: buildGoogleParams,
		send: dependencies.send ?? sendGoogleContent,
	});
	if (dependencies.send) return inner;
	return {
		...inner,
		async stream(request: ModelCallRequest<"google-generative-ai", GoogleOptions>) {
			const client = createGoogleClient(request);
			const context = await materializeGeminiVideoUploads(request.context, createGeminiFileUploader(client));
			return inner.stream({ ...request, context });
		},
	};
}
