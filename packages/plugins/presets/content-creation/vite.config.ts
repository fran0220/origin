import tailwindcss from "@tailwindcss/vite";
import { vettaPluginFederation } from "@origin-org/plugin-vite";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		tailwindcss(),
		vettaPluginFederation({
			name: "content_creation",
			entry: "./src/index.tsx",
			hostUi: true,
		}),
	],
	esbuild: {
		jsx: "automatic",
		jsxImportSource: "react",
	},
});
