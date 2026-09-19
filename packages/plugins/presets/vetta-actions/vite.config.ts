import { vettaPluginFederation } from "@origin-org/plugin-vite";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		vettaPluginFederation({
			name: "vetta_actions",
			entry: "./src/index.ts",
		}),
	],
});
