import { originPluginFederation } from "@origin-org/plugin-vite";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		originPluginFederation({
			name: "vetta_actions",
			entry: "./src/index.ts",
		}),
	],
});
