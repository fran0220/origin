import tailwindcss from "@tailwindcss/vite";
import { originPluginFederation } from "@origin-org/plugin-vite";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		tailwindcss(),
		originPluginFederation({
			name: "kanban",
			entry: "./src/index.tsx",
			hostUi: true,
			hostThemeUi: true,
		}),
	],
	esbuild: {
		jsx: "automatic",
		jsxImportSource: "react",
	},
});
