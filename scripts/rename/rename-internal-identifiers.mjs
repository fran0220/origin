#!/usr/bin/env node
/**
 * Origin 第二阶段内部标识符迁移扫描器。
 *
 * 默认 --dry-run：只统计将改动的文件，不写盘。
 * 写操作需显式 --apply；当前实现仍拒绝 --apply，避免在并行开发期误执行。
 *
 *   node scripts/rename/rename-internal-identifiers.mjs --dry-run
 *   node scripts/rename/rename-internal-identifiers.mjs --step npm-scope --dry-run
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const repoRoot = join(import.meta.dirname, "..", "..");

const IGNORE_DIR_NAMES = new Set([
	".git",
	"node_modules",
	"dist",
	".next",
	"coverage",
	"release",
	"build",
	".turbo",
	"vendor",
]);

const TEXT_EXTENSIONS = new Set([
	".ts",
	".tsx",
	".js",
	".mjs",
	".cjs",
	".json",
	".md",
	".mdx",
	".yml",
	".yaml",
	".toml",
	".html",
	".css",
	".svg",
	".txt",
	".kt",
	".kts",
	".go",
	".swift",
	".plist",
	".iss",
	".gradle",
]);

const STEPS = {
	"npm-scope": {
		title: "npm scope (@origin/* → @origin/*, @origin-org/* → @origin-org/*)",
		patterns: [/@vetta\//g, /@origin-org\//g],
	},
	"data-dir": {
		title: "data dir ~/.origin and ORIGIN_* env vars",
		patterns: [/~\/\.origin\b/g, /"\.origin"/g, /'\.origin'/g, /\bORIGIN_HOME\b/g, /\bORIGIN_CONFIG_DIR\b/g, /\bORIGIN_CODING_AGENT_DIR\b/g, /\bORIGIN_API_TOKEN\b/g],
	},
	ipc: {
		title: "IPC prefix vetta: and window.originApp",
		patterns: [/vetta:[a-z]/g, /window\.origin\b/g],
	},
	"ci-sdk": {
		title: "CI artifacts, plugin SDK, skills-lock, remaining Vetta literals",
		patterns: [/skills-lock\.json/g, /pluginApiVersion/g, /@origin-org\/plugin-sdk/g],
	},
};

function parseArgs(argv) {
	const args = {
		dryRun: true,
		apply: false,
		step: "all",
		fromScope: "@vetta",
		toScope: "@origin",
		fromOrgScope: "@origin-org",
		toOrgScope: "@origin-org",
	};
	for (let i = 0; i < argv.length; i += 1) {
		const token = argv[i];
		if (token === "--dry-run") args.dryRun = true;
		else if (token === "--apply") args.apply = true;
		else if (token === "--step") args.step = argv[++i] ?? "all";
		else if (token === "--from-scope") args.fromScope = argv[++i] ?? args.fromScope;
		else if (token === "--to-scope") args.toScope = argv[++i] ?? args.toScope;
		else if (token === "--from-org-scope") args.fromOrgScope = argv[++i] ?? args.fromOrgScope;
		else if (token === "--to-org-scope") args.toOrgScope = argv[++i] ?? args.toOrgScope;
		else if (token === "--help" || token === "-h") args.help = true;
	}
	return args;
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
		if (entry.isDirectory()) {
			walk(fullPath, files);
			continue;
		}
		if (!entry.isFile()) continue;
		const extension = extname(entry.name);
		if (extension && !TEXT_EXTENSIONS.has(extension) && entry.name !== "bun.lock") continue;
		try {
			if (statSync(fullPath).size > 2_000_000) continue;
		} catch {
			continue;
		}
		files.push(fullPath);
	}
	return files;
}

function countMatches(text, patterns) {
	let total = 0;
	for (const pattern of patterns) {
		pattern.lastIndex = 0;
		const matches = text.match(pattern);
		if (matches) total += matches.length;
	}
	return total;
}

function selectedSteps(step) {
	if (step === "all") return Object.entries(STEPS);
	if (!(step in STEPS)) {
		throw new Error(`unknown step: ${step}. expected one of ${Object.keys(STEPS).join(", ")}, all`);
	}
	return [[step, STEPS[step]]];
}

function main() {
	const args = parseArgs(process.argv.slice(2));
	if (args.help) {
		process.stdout.write(`Usage: node scripts/rename/rename-internal-identifiers.mjs [--dry-run] [--step <name>] [--from-scope @vetta] [--to-scope @origin]\n`);
		process.exit(0);
	}
	if (args.apply) {
		process.stderr.write("refuse --apply: second-stage write is deferred until other threads merge. Re-run with --dry-run.\n");
		process.exit(2);
	}

	const files = walk(repoRoot);
	const steps = selectedSteps(args.step);
	const summary = [];

	process.stdout.write(`scan root: ${repoRoot}\n`);
	process.stdout.write(`files scanned: ${files.length}\n`);
	process.stdout.write(`scopes: ${args.fromScope} → ${args.toScope}, ${args.fromOrgScope} → ${args.toOrgScope}\n`);
	process.stdout.write(`mode: dry-run\n\n`);

	for (const [id, step] of steps) {
		let fileCount = 0;
		let hitCount = 0;
		const sample = [];
		for (const filePath of files) {
			let text = "";
			try {
				text = readFileSync(filePath, "utf8");
			} catch {
				continue;
			}
			const hits = countMatches(text, step.patterns);
			if (hits === 0) continue;
			fileCount += 1;
			hitCount += hits;
			if (sample.length < 8) sample.push(`${relative(repoRoot, filePath)} (${hits})`);
		}
		summary.push({ id, title: step.title, fileCount, hitCount, sample });
		process.stdout.write(`## ${id}\n${step.title}\nfiles: ${fileCount}\nhits: ${hitCount}\n`);
		for (const line of sample) process.stdout.write(`  ${line}\n`);
		process.stdout.write("\n");
	}

	process.stdout.write("totals\n");
	for (const row of summary) {
		process.stdout.write(`  ${row.id}\t${row.fileCount} files\t${row.hitCount} hits\n`);
	}
}

main();
