import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import nodePath from "node:path";
import { getOriginHomePath } from "@origin/action-rpc";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import {
	type CommandProcessPort,
	DesktopCommandAbortedError,
	type DesktopCommandPort,
} from "../shared/desktop-command.js";
import { createNodeCommandProcessHost, NodeCommandProcessAbortedError } from "./command-process.js";

const DesktopConfigSchema = Type.Object(
	{ originAppPath: Type.Optional(Type.String({ minLength: 1 })) },
	{ additionalProperties: true },
);

export interface NodeOriginDesktopCommandPortOptions {
	readonly commandProcess?: CommandProcessPort;
	readonly platform?: NodeJS.Platform;
	readonly environment?: Readonly<Record<string, string | undefined>>;
	readonly originHomePath?: string;
	readonly fileExists?: (filePath: string) => Promise<boolean>;
	readonly readTextFile?: (filePath: string) => Promise<string>;
}

export function createNodeOriginDesktopCommandPort(
	options: NodeOriginDesktopCommandPortOptions = {},
): DesktopCommandPort {
	const commandProcess = options.commandProcess ?? createNodeCommandProcessHost();
	const locationOptions: OriginExecutableLocationOptions = {
		platform: options.platform ?? process.platform,
		environment: options.environment ?? process.env,
		originHomePath: options.originHomePath,
		fileExists: options.fileExists ?? defaultFileExists,
		readTextFile: options.readTextFile ?? defaultReadTextFile,
	};
	return {
		locate: () => findVettaExecutable(locationOptions),
		async run(executable, args, options) {
			try {
				return await commandProcess.run(executable, args, options);
			} catch (error) {
				if (error instanceof NodeCommandProcessAbortedError) throw new DesktopCommandAbortedError();
				throw error;
			}
		},
	};
}

interface OriginExecutableLocationOptions {
	readonly platform: NodeJS.Platform;
	readonly environment: Readonly<Record<string, string | undefined>>;
	readonly originHomePath?: string;
	readonly fileExists: (filePath: string) => Promise<boolean>;
	readonly readTextFile: (filePath: string) => Promise<string>;
}

async function findVettaExecutable(
	options: OriginExecutableLocationOptions,
): Promise<{ path: string; staleConfiguredPath?: string }> {
	const environmentPath = options.environment.ORIGIN_DESKTOP_EXE;
	if (environmentPath && (await options.fileExists(environmentPath))) return { path: environmentPath };
	const configuredPath = await readConfiguredVettaAppPath(options);
	if (configuredPath && (await options.fileExists(configuredPath))) return { path: configuredPath };
	const candidates =
		options.platform === "win32"
			? [
					nodePath.join(options.environment.LOCALAPPDATA ?? "", "Programs", "Vetta", "Vetta.exe"),
					nodePath.join(options.environment.ProgramFiles ?? "C:\\Program Files", "Vetta", "Vetta.exe"),
				]
			: ["/Applications/Vetta.app/Contents/MacOS/Vetta", "/usr/local/bin/vetta-desktop"];
	for (const candidate of candidates) {
		if (candidate && (await options.fileExists(candidate))) {
			return { path: candidate, staleConfiguredPath: configuredPath };
		}
	}
	const staleNote = configuredPath ? ` Configured originAppPath is stale: ${configuredPath}` : "";
	throw new Error(
		`Origin Desktop executable not found. Set ORIGIN_DESKTOP_EXE or start Origin Desktop once to write originAppPath.${staleNote}`,
	);
}

async function readConfiguredVettaAppPath(options: OriginExecutableLocationOptions): Promise<string | undefined> {
	try {
		const raw = await options.readTextFile(
			nodePath.join(options.originHomePath ?? getOriginHomePath(), "desktop-config.json"),
		);
		const parsed: unknown = JSON.parse(raw);
		return Value.Check(DesktopConfigSchema, parsed) ? parsed.originAppPath : undefined;
	} catch {
		return undefined;
	}
}

async function defaultFileExists(filePath: string): Promise<boolean> {
	try {
		await access(filePath, constants.X_OK);
		return true;
	} catch {
		try {
			await access(filePath, constants.F_OK);
			return true;
		} catch {
			return false;
		}
	}
}

function defaultReadTextFile(filePath: string): Promise<string> {
	return readFile(filePath, "utf8");
}
