import { federation, type ModuleFederationOptions } from "@module-federation/vite";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parsePluginManifest } from "@origin-org/plugin-sdk/manifest";
import type { Plugin, PluginOption } from "vite";
import {
	createOriginPluginDevPlugins,
	isOriginPluginDevServer,
	ORIGIN_PLUGIN_DEV_ENTRY_ID,
} from "./dev-vite-plugins.js";
import { createPluginBuildWarningFilter } from "./build-warning-filter.js";
import { createHostThemeBridgePlugin } from "./host-theme.js";
import { type CreateOriginPluginPackageOptions, createOriginPluginPackage } from "./pack.js";
import { assertPluginPermissionContract } from "./permission-contract.js";
import { createPluginStyleScopePlugin } from "./style-scope.js";
import { createPluginLoggerBindingPlugin } from "./plugin-logger.js";

const SHARED_REACT_COMMONJS_BRIDGE_ID = "virtual:origin-plugin-shared-react-commonjs";
const RESOLVED_SHARED_REACT_COMMONJS_BRIDGE_ID = `\0${SHARED_REACT_COMMONJS_BRIDGE_ID}`;
const STATIC_REACT_REQUIRE_PATTERN = /\brequire\s*\(\s*(["'])react\1\s*\)/gu;

export interface OriginPluginPackageOptions extends Omit<CreateOriginPluginPackageOptions, "rootDir" | "distDir"> {
	enabled?: boolean;
}

export interface OriginPluginFederationOptions {
	name: string;
	expose?: string;
	entry?: string;
	manifestFileName?: string;
	remoteEntryFileName?: string;
	/** Share the host design-system primitives exposed by `@origin-org/ui`. */
	hostUi?: boolean;
	/** Share the narrow host UI contract exposed by `@origin-org/theme-ui/plugin-ui`. */
	hostThemeUi?: boolean;
	shared?: ModuleFederationOptions["shared"];
	package?: boolean | OriginPluginPackageOptions;
}

export function createOriginPluginFederationConfig(options: OriginPluginFederationOptions): ModuleFederationOptions {
	const expose = options.expose ?? "./plugin";
	const entry = options.entry ?? "./src/index.tsx";
	return {
		name: options.name,
		filename: options.remoteEntryFileName ?? "remoteEntry.js",
		exposes: {
			[expose]: entry,
		},
		manifest: {
			fileName: options.manifestFileName ?? "mf-manifest.json",
		},
		dts: false,
		shared: {
			"@origin-org/plugin-sdk": {
				singleton: true,
				import: false,
				requiredVersion: "*",
			},
			react: {
				singleton: true,
				import: false,
				requiredVersion: "*",
			},
			"react-dom": {
				singleton: true,
				import: false,
				requiredVersion: "*",
			},
			// Match host plugin-shared-modules (tldraw remotes may require this subpath).
			"react-dom/client": {
				singleton: true,
				import: false,
				requiredVersion: "*",
			},
			...(options.hostUi
				? {
						// Host design-system primitives; runtime provided by desktop-app share scope.
						"@origin-org/ui": {
							singleton: true,
							import: false,
							requiredVersion: "*",
						},
					}
				: {}),
			...(options.hostThemeUi
				? {
						// Host-built UI components (model selector, …); opt in to keep unrelated plugins decoupled.
						"@origin-org/theme-ui/plugin-ui": {
							singleton: true,
							import: false,
							requiredVersion: "*",
						},
					}
				: {}),
			...options.shared,
		},
	};
}

function createBuildDefaultsPlugin(entry: string, options: Pick<OriginPluginFederationOptions, "hostUi">): Plugin {
	return {
		name: "origin-plugin-build-defaults",
		apply: "build",
		config() {
			return {
				// Plugin remotes run inside the host page. Absolute asset URLs like
				// `/icon.png` resolve against the host origin (desktop-app public/), not
				// the remote. Prefer inlining small assets; large ones still go under
				// assets/ and rely on MF publicPath, but never land on host public/.
				build: {
					assetsInlineLimit: 32 * 1024,
					rollupOptions: {
						input: entry,
						// Host-provided singletons (see desktop-app plugin-shared-modules + origin-host protocol).
						external: [
							"@origin-org/plugin-sdk",
							...(options.hostUi
								? [
										"@origin-org/ui",
										// 旧源码名仍映射到宿主；已构建的旧 remote 则由 Desktop share scope 兼容。
										"@origin/ui",
									]
								: []),
							"@origin-org/theme-ui/plugin-ui",
							"@origin/theme-ui/plugin-ui",
						],
						output: {
							assetFileNames(assetInfo) {
								return assetInfo.names.some((name) => name.endsWith(".css"))
									? "style.css"
									: "assets/[name]-[hash][extname]";
							},
							paths: {
								"@origin-org/plugin-sdk": "origin-host://plugin-sdk",
								"@origin-org/ui": "origin-host://ui",
								"@origin/ui": "origin-host://ui",
								"@origin-org/theme-ui/plugin-ui": "origin-host://theme-ui-plugin",
								"@origin/theme-ui/plugin-ui": "origin-host://theme-ui-plugin",
							},
						},
					},
				},
			};
		},
	};
}

// Module Federation exposes shared React through a virtual ESM module. Routing
// static CommonJS requires through this namespace keeps Rollup's generated
// bindings stable when dependencies such as use-sync-external-store are bundled.
function createSharedReactCommonJsBridgePlugin(): Plugin {
	return {
		name: "origin-plugin-shared-react-commonjs-bridge",
		apply: "build",
		enforce: "pre",
		transform(code) {
			if (!code.includes("require") || !code.includes("react")) return;
			const transformed = code.replace(
				STATIC_REACT_REQUIRE_PATTERN,
				`require(${JSON.stringify(SHARED_REACT_COMMONJS_BRIDGE_ID)})`,
			);
			if (transformed === code) return;
			return { code: transformed, map: null };
		},
		resolveId(id) {
			if (id === SHARED_REACT_COMMONJS_BRIDGE_ID) return RESOLVED_SHARED_REACT_COMMONJS_BRIDGE_ID;
		},
		load(id) {
			if (id !== RESOLVED_SHARED_REACT_COMMONJS_BRIDGE_ID) return;
			return `import * as React from "react";
export * from "react";
export default React;
`;
		},
	};
}

function createPackagePlugin(options: OriginPluginPackageOptions): Plugin {
	let rootDir = "";
	let distDir = "";
	let buildFailed = false;

	return {
		name: "origin-plugin-package",
		apply: "build",
		buildStart() {
			buildFailed = false;
		},
		buildEnd(error) {
			buildFailed = error !== undefined;
		},
		configResolved(config) {
			rootDir = config.root;
			distDir = config.build.outDir;
		},
		async closeBundle() {
			if (options.enabled === false || buildFailed) {
				return;
			}
			const result = await createOriginPluginPackage({
				...options,
				rootDir,
				distDir,
			});
			console.log(`[origin-plugin-vite] Wrote ${result.outputPath} with ${result.files.length} runtime files`);
		},
	};
}

function createPermissionContractPlugin(): Plugin {
	let rootDir = "";
	return {
		name: "origin-plugin-permission-contract",
		apply: "build",
		configResolved(config) {
			rootDir = config.root;
		},
		async generateBundle(_outputOptions, bundle) {
			const manifest = parsePluginManifest(
				JSON.parse(await readFile(resolve(rootDir, "plugin.json"), "utf8")) as unknown,
			);
			assertPluginPermissionContract(
				manifest,
				Object.values(bundle).flatMap((output) =>
					output.type === "chunk" ? [{ fileName: output.fileName, code: output.code }] : [],
				),
			);
		},
	};
}

export function originPluginFederation(options: OriginPluginFederationOptions): PluginOption[] {
	const packageOptions = typeof options.package === "object" ? options.package : {};
	const entry = options.entry ?? "./src/index.tsx";
	const devServer = isOriginPluginDevServer();
	const plugins: PluginOption[] = [
		createPluginBuildWarningFilter(),
		createHostThemeBridgePlugin(),
		createPluginLoggerBindingPlugin(),
		...(devServer ? createOriginPluginDevPlugins(entry) : []),
		createBuildDefaultsPlugin(entry, options),
		createSharedReactCommonJsBridgePlugin(),
		...federation({
			...createOriginPluginFederationConfig(options),
			exposes: {
				[options.expose ?? "./plugin"]: devServer ? ORIGIN_PLUGIN_DEV_ENTRY_ID : entry,
			},
		}),
		createPluginStyleScopePlugin(),
		createPermissionContractPlugin(),
	];
	// 兼容旧宿主的 build-watch 流程：增量构建时不重复打 zip。
	if (options.package !== false && process.env.ORIGIN_PLUGIN_DEV_WATCH !== "1") {
		plugins.push(createPackagePlugin(packageOptions));
	}
	return plugins;
}
