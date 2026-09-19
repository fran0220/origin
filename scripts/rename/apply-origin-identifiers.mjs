#!/usr/bin/env node
/**
 * Origin 第二阶段内部标识符写盘工具。
 *
 *   node scripts/rename/apply-origin-identifiers.mjs --dry-run
 *   node scripts/rename/apply-origin-identifiers.mjs --apply --step <name|all>
 *
 * 步骤：npm-scope | data-dir | ipc | identity | agent-profiles | remaining | all
 *
 * 不改 docs/adr 当时用词；不改 vetta-serv / vetta-go / vetta:// 深链 /
 * openvetta / open-vetta GitHub 引用 / cowart-vetta / VETD_* / Go module /
 * Kotlin 包路径 org.vetta。无旧路径、旧环境变量、旧 preload 名回落。
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

const repoRoot = join(import.meta.dirname, "..", "..");

const IGNORE_DIR_NAMES = new Set([
	".git",
	"node_modules",
	"dist",
	".next",
	"coverage",
	"build",
	".turbo",
	"vendor",
	".artifacts",
]);

const BINARY_EXTENSIONS = new Set([
	".png",
	".jpg",
	".jpeg",
	".webp",
	".gif",
	".ico",
	".icns",
	".woff",
	".woff2",
	".ttf",
	".eot",
	".mp4",
	".mp3",
	".wav",
	".pdf",
	".zip",
	".gz",
	".tgz",
	".jar",
	".class",
	".so",
	".dylib",
	".node",
	".wasm",
	".bin",
	".exe",
	".dmg",
	".7z",
]);

const SKIP_PATH_PREFIXES = ["docs/adr/", "scripts/rename/apply-origin-identifiers.mjs"];

const STEP_NAMES = ["npm-scope", "data-dir", "ipc", "identity", "agent-profiles", "remaining"];

const PROTECTIONS = [
	[/vetta-serv/g, "SERV"],
	[/vetta-go/g, "GO"],
	[/vetta:\/\//g, "DEEPLINK"],
	[/openvetta\/open-vetta/g, "GHREPO"],
	[/open-vetta/g, "GHREPO2"],
	[/openvetta/g, "GHORG"],
	[/cowart-vetta/g, "COWART"],
	[/vetta-official-marketplace/g, "MARKET"],
	[/vetta-im-gateway/g, "GOMOD"],
	[/org\.origin/g, "KOTLIN"],
	[/VETD_/g, "VETDENV"],
	[/\.vetd\b/g, "VETDDIR"],
	[/APP_LEGACY_PROTOCOL_SCHEME/g, "LEGACYAPP"],
	[/LEGACY_PROTOCOL_SCHEME/g, "LEGACY"],
];

const RESTORE = {
	SERV: "vetta-serv",
	GO: "vetta-go",
	DEEPLINK: "vetta://",
	GHREPO: "openvetta/open-vetta",
	GHREPO2: "open-vetta",
	GHORG: "openvetta",
	COWART: "cowart-vetta",
	MARKET: "vetta-official-marketplace",
	GOMOD: "vetta-im-gateway",
	KOTLIN: "org.vetta",
	VETDENV: "VETD_",
	VETDDIR: ".vetd",
	LEGACYAPP: "APP_LEGACY_PROTOCOL_SCHEME",
	LEGACY: "LEGACY_PROTOCOL_SCHEME",
};

function protect(text) {
	let next = text;
	for (const [pattern, id] of PROTECTIONS) {
		next = next.replace(pattern, `@@KEEP_${id}@@`);
	}
	return next;
}

function unprotect(text) {
	let next = text;
	for (const [id, value] of Object.entries(RESTORE)) {
		next = next.replaceAll(`@@KEEP_${id}@@`, value);
	}
	return next;
}

const STEP_REPLACEMENTS = {
	"npm-scope": [
		["@origin-org/", "@origin-org/"],
		["@origin/", "@origin/"],
	],
	"data-dir": [
		["getOriginConfigDirName", "getOriginConfigDirName"],
		["getOriginHomePath", "getOriginHomePath"],
		["ORIGIN_HOME_ENV", "ORIGIN_HOME_ENV"],
		["ORIGIN_CONFIG_DIR_ENV", "ORIGIN_CONFIG_DIR_ENV"],
		["originHomePath", "originHomePath"],
		["originHome", "originHome"],
		["DEFAULT_CONFIG_DIR_NAME = \".origin\"", "DEFAULT_CONFIG_DIR_NAME = \".origin\""],
		["CONFIG_DIR_NAME = \".origin\"", "CONFIG_DIR_NAME = \".origin\""],
		['CONFIG_DIRECTORY = ".origin"', 'CONFIG_DIRECTORY = ".origin"'],
		['PROJECT_CONFIG_DIRECTORY = ".origin"', 'PROJECT_CONFIG_DIRECTORY = ".origin"'],
		["ORIGIN_", "ORIGIN_"],
		["~/.origin", "~/.origin"],
		[".origin", ".origin"],
	],
	ipc: [
		["window.originQuickPanel", "window.originQuickPanel"],
		["window.originOnboarding", "window.originOnboarding"],
		["window.originRemoteDesktop", "window.originRemoteDesktop"],
		["window.originPet", "window.originPet"],
		["window.origin", "window.originApp"],
		["__vettaRecordingAudio", "__originRecordingAudio"],
		["__originOcr", "__originOcr"],
		["__ORIGIN_PLUGIN_DEV_MODULES__", "__ORIGIN_PLUGIN_DEV_MODULES__"],
		["__ORIGIN_PLUGIN_HOST__", "__ORIGIN_PLUGIN_HOST__"],
		['exposeInMainWorld("vettaQuickPanel"', 'exposeInMainWorld("originQuickPanel"'],
		['exposeInMainWorld("vettaOnboarding"', 'exposeInMainWorld("originOnboarding"'],
		['exposeInMainWorld("vettaRemoteDesktop"', 'exposeInMainWorld("originRemoteDesktop"'],
		['exposeInMainWorld("vettaPet"', 'exposeInMainWorld("originPet"'],
		['exposeInMainWorld("vetta"', 'exposeInMainWorld("originApp"'],
		["exposeInMainWorld('vettaQuickPanel'", "exposeInMainWorld('originQuickPanel'"],
		["exposeInMainWorld('vettaOnboarding'", "exposeInMainWorld('originOnboarding'"],
		["exposeInMainWorld('vettaRemoteDesktop'", "exposeInMainWorld('originRemoteDesktop'"],
		["exposeInMainWorld('vettaPet'", "exposeInMainWorld('originPet'"],
		["exposeInMainWorld('vetta'", "exposeInMainWorld('originApp'"],
		["expect(name).toBe(\"vetta\")", "expect(name).toBe(\"originApp\")"],
		["\tvetta: DesktopApi", "\toriginApp: DesktopApi"],
		["\tvetta?:", "\toriginApp?:"],
		["\tvetta: {", "\toriginApp: {"],
		['node.name.text === "vetta"', 'node.name.text === "originApp"'],
		["node.name.text === 'vetta'", "node.name.text === 'originApp'"],
		["vettaQuickPanel", "originQuickPanel"],
		["vettaOnboarding", "originOnboarding"],
		["vettaRemoteDesktop", "originRemoteDesktop"],
		["vettaPet", "originPet"],
	],
	identity: [
		['APP_RUNTIME_NAME = "vetta"', 'APP_RUNTIME_NAME = "origin"'],
		["APP_RUNTIME_NAME = 'vetta'", "APP_RUNTIME_NAME = 'origin'"],
		['APP_NAME = "vetta"', 'APP_NAME = "origin"'],
		["APP_NAME = 'vetta'", "APP_NAME = 'origin'"],
		['expect(APP_RUNTIME_NAME).toBe("vetta")', 'expect(APP_RUNTIME_NAME).toBe("origin")'],
		['expect(APP_NAME).toBe("vetta")', 'expect(APP_NAME).toBe("origin")'],
		["cap.foundation.origin", "cap.foundation.origin"],
		["cap.domain.origin", "cap.domain.origin"],
		["vetta-file", "origin-file"],
		["vetta-media", "origin-media"],
		["vetta-asset", "origin-asset"],
		['"name": "open-vetta"', '"name": "origin"'],
	],
	"agent-profiles": [
		["agent-teams", "agent-profiles"],
		["AgentTeams", "AgentProfiles"],
		["agent-team", "agent-profile"],
		["AgentTeam", "AgentProfile"],
		["agentTeam", "agentProfile"],
	],
	remaining: [
		["createVettaPluginFederationConfig", "createOriginPluginFederationConfig"],
		["createVettaPluginDevPlugins", "createOriginPluginDevPlugins"],
		["createVettaPluginPackage", "createOriginPluginPackage"],
		["startVettaPluginDevServer", "startOriginPluginDevServer"],
		["vettaPluginFederation", "originPluginFederation"],
		["CreateVettaPluginPackageOptions", "CreateOriginPluginPackageOptions"],
		["VettaPluginFederationOptions", "OriginPluginFederationOptions"],
		["VettaPluginPackageOptions", "OriginPluginPackageOptions"],
		["VettaPluginPackageResult", "OriginPluginPackageResult"],
		["VettaPluginPackageFile", "OriginPluginPackageFile"],
		["VettaPluginDevWatchState", "OriginPluginDevWatchState"],
		["VettaPluginDevEventListener", "OriginPluginDevEventListener"],
		["VettaPluginDevServer", "OriginPluginDevServer"],
		["VettaPluginDevEvent", "OriginPluginDevEvent"],
		["VettaNpmPluginMetadataSchema", "OriginNpmPluginMetadataSchema"],
		["VettaNpmPluginMetadata", "OriginNpmPluginMetadata"],
		["VettaNpmPluginPackage", "OriginNpmPluginPackage"],
		["VettaPluginPackage", "OriginPluginPackage"],
		["createVettaImageProvider", "createOriginImageProvider"],
		["VettaOcrConfiguration", "OriginOcrConfiguration"],
		["VettaHostSurface", "OriginHostSurface"],
		["VettaPluginsChangedEvent", "OriginPluginsChangedEvent"],
		["VettaPluginsApiSurface", "OriginPluginsApiSurface"],
		["VettaPluginsApi", "OriginPluginsApi"],
		["VettaFsApiSurface", "OriginFsApiSurface"],
		["VettaFsFileRef", "OriginFsFileRef"],
		["VettaFsApi", "OriginFsApi"],
		["VettaWindowApi", "OriginWindowApi"],
		["VettaDialogSaveCopyOptions", "OriginDialogSaveCopyOptions"],
		["VettaDialogApi", "OriginDialogApi"],
		["VettaGoCard", "OriginGoCard"],
		["NodeVettaDesktopCommandPortOptions", "NodeOriginDesktopCommandPortOptions"],
		["DevVettaCliShimOptions", "DevOriginCliShimOptions"],
		["VettaExecutableLocationOptions", "OriginExecutableLocationOptions"],
		['"vetta-actions"', '"origin-actions"'],
		['"vetta-ui-design"', '"origin-ui-design"'],
		["vetta-actions", "origin-actions"],
		["vetta-ui-design", "origin-ui-design"],
		["vetta-apple-app-dev-guide", "origin-apple-app-dev-guide"],
		["vetta-desktop-command-port", "origin-desktop-command-port"],
		["vetta-credentials", "origin-credentials"],
		["vetta-image-provider", "origin-image-provider"],
		["vetta-blog", "origin-blog"],
		["vetta-testing", "origin-testing"],
		["vetta-debug", "origin-debug"],
		["vetta-plugin-cli", "origin-plugin-cli"],
		["vetta-plugin", "origin-plugin"],
		["vetta-agent-rpc", "origin-agent-rpc"],
		["vetta-cli-app", "origin-cli-app"],
		["vetta-agent", "origin-agent"],
		['"vetta": "dist/cli.js"', '"origin": "dist/cli.js"'],
	],
};

const STEP_PATH_RENAMES = {
	"agent-profiles": [
		["packages/agent-team", "packages/agent-profile"],
		["apps/desktop/src/main/agent-teams", "apps/desktop/src/main/agent-profiles"],
		["apps/desktop/src/renderer/domains/agent-teams", "apps/desktop/src/renderer/domains/agent-profiles"],
		["apps/desktop/src/renderer/shared/agent-teams", "apps/desktop/src/renderer/shared/agent-profiles"],
		["apps/desktop/src/renderer/public/agent-team-avatars", "apps/desktop/src/renderer/public/agent-profile-avatars"],
		[
			"apps/desktop/src/shared/i18n/locales/zh/agent-teams.json",
			"apps/desktop/src/shared/i18n/locales/zh/agent-profiles.json",
		],
		[
			"apps/desktop/src/shared/i18n/locales/en/agent-teams.json",
			"apps/desktop/src/shared/i18n/locales/en/agent-profiles.json",
		],
		["apps/desktop/src/shared/agent-team-avatar.ts", "apps/desktop/src/shared/agent-profile-avatar.ts"],
		["apps/desktop/src/main/ipc/agent-teams.ts", "apps/desktop/src/main/ipc/agent-profiles.ts"],
		["apps/desktop/src/preload/api-types/agent-teams.ts", "apps/desktop/src/preload/api-types/agent-profiles.ts"],
		["apps/desktop/src/preload/apis/agent-teams.ts", "apps/desktop/src/preload/apis/agent-profiles.ts"],
		["apps/desktop/src/preload/apis/agent-teams.test.ts", "apps/desktop/src/preload/apis/agent-profiles.test.ts"],
		[
			"apps/desktop/src/renderer/domains/conversation/components/new-session/agent-team-directory.ts",
			"apps/desktop/src/renderer/domains/conversation/components/new-session/agent-profile-directory.ts",
		],
		[
			"apps/desktop/src/renderer/domains/conversation/components/new-session/agent-team-directory.test.ts",
			"apps/desktop/src/renderer/domains/conversation/components/new-session/agent-profile-directory.test.ts",
		],
		["docs/ui/agent-team-chat-infrastructure.md", "docs/ui/agent-profile-chat-infrastructure.md"],
		["apps/docs-site/content/docs/product/agent-teams.mdx", "apps/docs-site/content/docs/product/agent-profiles.mdx"],
		[
			"apps/docs-site/content/docs/en/product/agent-teams.mdx",
			"apps/docs-site/content/docs/en/product/agent-profiles.mdx",
		],
	],
	remaining: [
		["packages/plugins/presets/vetta-actions", "packages/plugins/presets/origin-actions"],
		["packages/plugins/presets/vetta-ui-design", "packages/plugins/presets/origin-ui-design"],
		[
			"packages/plugins/presets/build-apple-apps/agent/skills/vetta-apple-app-dev-guide",
			"packages/plugins/presets/build-apple-apps/agent/skills/origin-apple-app-dev-guide",
		],
		["packages/runtime-node/src/mcp/auth/vetta-credentials.ts", "packages/runtime-node/src/mcp/auth/origin-credentials.ts"],
		[
			"packages/runtime-node/src/coding/host/vetta-desktop-command-port.ts",
			"packages/runtime-node/src/coding/host/origin-desktop-command-port.ts",
		],
		[
			"packages/runtime-node/test/coding-suite/vetta-desktop-command-port.test.ts",
			"packages/runtime-node/test/coding-suite/origin-desktop-command-port.test.ts",
		],
		["packages/coding-agent/test/vetta-credentials.test.ts", "packages/coding-agent/test/origin-credentials.test.ts"],
		[
			"apps/desktop/src/main/media-generation/vetta-image-provider.ts",
			"apps/desktop/src/main/media-generation/origin-image-provider.ts",
		],
		[
			"packages/plugins/externals/mobile-ui-preview/src/vetta.d.ts",
			"packages/plugins/externals/mobile-ui-preview/src/origin-app.d.ts",
		],
		[
			"packages/plugins/externals/security-probe/src/vetta.d.ts",
			"packages/plugins/externals/security-probe/src/origin-app.d.ts",
		],
		[
			"packages/plugins/presets/plugin-workbench/src/vetta.d.ts",
			"packages/plugins/presets/plugin-workbench/src/origin-app.d.ts",
		],
		["packages/skill-presets/test/vetta-blog-validator.test.ts", "packages/skill-presets/test/origin-blog-validator.test.ts"],
		["packages/skill-presets/vetta-blog", "packages/skill-presets/origin-blog"],
		["docs/dev/vetta-debug.md", "docs/dev/origin-debug.md"],
		["docs/dev/vetta-debug-real-provider-runbook.md", "docs/dev/origin-debug-real-provider-runbook.md"],
		[".agents/skills/vetta-testing", ".agents/skills/origin-testing"],
		[".claude/skills/vetta-testing", ".claude/skills/origin-testing"],
		["open-vetta.code-workspace", "origin.code-workspace"],
		["vetta-test.sh", "origin-test.sh"],
	],
};

function parseArgs(argv) {
	const args = { dryRun: true, apply: false, step: "all" };
	for (let i = 0; i < argv.length; i += 1) {
		const token = argv[i];
		if (token === "--dry-run") args.dryRun = true;
		else if (token === "--apply") {
			args.apply = true;
			args.dryRun = false;
		} else if (token === "--step") args.step = argv[++i] ?? "all";
		else if (token === "--help" || token === "-h") args.help = true;
	}
	return args;
}

function selectedSteps(step) {
	if (step === "all") return STEP_NAMES;
	if (!STEP_NAMES.includes(step)) {
		throw new Error(`unknown step: ${step}. expected ${STEP_NAMES.join(", ")}, all`);
	}
	return [step];
}

function walk(directory, files = []) {
	let entries = [];
	try {
		entries = readdirSync(directory, { withFileTypes: true });
	} catch {
		return files;
	}
	for (const entry of entries) {
		if (IGNORE_DIR_NAMES.has(entry.name)) continue;
		const fullPath = join(directory, entry.name);
		const rel = relative(repoRoot, fullPath).replaceAll("\\", "/");
		if (SKIP_PATH_PREFIXES.some((prefix) => rel === prefix.slice(0, -1) || rel.startsWith(prefix))) continue;
		if (entry.isDirectory()) {
			walk(fullPath, files);
			continue;
		}
		if (!entry.isFile()) continue;
		const extension = extname(entry.name).toLowerCase();
		if (BINARY_EXTENSIONS.has(extension)) continue;
		try {
			if (statSync(fullPath).size > 2_500_000) continue;
		} catch {
			continue;
		}
		files.push(fullPath);
	}
	return files;
}

function applyIpcChannelPrefix(text) {
	return text
		.replaceAll('"vetta:', '"origin:')
		.replaceAll("'vetta:", "'origin:")
		.replaceAll("`vetta:", "`origin:");
}

function transform(text, steps) {
	let next = protect(text);
	for (const step of steps) {
		if (step === "ipc") next = applyIpcChannelPrefix(next);
		const replacements = STEP_REPLACEMENTS[step] ?? [];
		for (const [from, to] of replacements) {
			if (next.includes(from)) next = next.split(from).join(to);
		}
	}
	return unprotect(next);
}

function gitMv(fromRel, toRel) {
	const fromPath = join(repoRoot, fromRel);
	const toPath = join(repoRoot, toRel);
	if (!existsSync(fromPath) || existsSync(toPath)) return false;
	execFileSync("git", ["mv", fromRel, toRel], { cwd: repoRoot, stdio: "pipe" });
	return true;
}

function main() {
	const args = parseArgs(process.argv.slice(2));
	if (args.help) {
		process.stdout.write(
			"Usage: node scripts/rename/apply-origin-identifiers.mjs [--dry-run|--apply] [--step <name|all>]\n",
		);
		process.exit(0);
	}

	const steps = selectedSteps(args.step);
	const files = walk(repoRoot);
	const changed = [];
	for (const file of files) {
		const original = readFileSync(file, "utf8");
		const next = transform(original, steps);
		if (next === original) continue;
		changed.push(relative(repoRoot, file).replaceAll("\\", "/"));
		if (args.apply) writeFileSync(file, next);
	}

	const moved = [];
	for (const step of steps) {
		for (const [fromRel, toRel] of STEP_PATH_RENAMES[step] ?? []) {
			if (args.apply) {
				if (gitMv(fromRel, toRel)) moved.push(`${fromRel} -> ${toRel}`);
			} else if (existsSync(join(repoRoot, fromRel))) {
				moved.push(`${fromRel} -> ${toRel}`);
			}
		}
	}

	process.stdout.write(
		JSON.stringify(
			{
				mode: args.apply ? "apply" : "dry-run",
				steps,
				filesScanned: files.length,
				filesChanged: changed.length,
				pathRenames: moved.length,
				changedSample: changed.slice(0, 50),
				renames: moved,
			},
			null,
			2,
		) + "\n",
	);
}

main();
