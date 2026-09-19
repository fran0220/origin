import { vettaPluginFederation } from "@origin-org/plugin-vite";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		vettaPluginFederation({
			name: "preset_agent",
			entry: "./src/index.tsx",
		}),
	],
	esbuild: {
		jsx: "automatic",
		jsxImportSource: "react",
	},
});
