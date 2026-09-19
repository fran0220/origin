import { originPluginFederation } from "@origin-org/plugin-vite";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		originPluginFederation({
			name: "remotion_renderer",
			entry: "./src/index.ts",
			hostUi: true,
		}),
	],
});
