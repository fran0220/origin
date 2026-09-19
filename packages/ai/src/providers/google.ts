export type { GoogleAdapterDependencies, GoogleContentSender } from "./google/adapter.js";
export { createGoogleAdapter, googleAdapter } from "./google/adapter.js";
export type { GoogleOptions } from "./google/options.js";
export { streamGoogle, streamSimpleGoogle } from "./google/stream.js";
export {
	createGeminiFileUploader,
	type GeminiFileUploader,
	materializeGeminiVideoUploads,
} from "./google/video-upload.js";
export {
	assertNoUnsupportedVideo,
	GEMINI_INLINE_VIDEO_MAX_BYTES,
	geminiVideoPart,
	isVideoContent,
	rejectUnsupportedVideo,
	rejectVideoIfPresent,
} from "./video-content.js";
