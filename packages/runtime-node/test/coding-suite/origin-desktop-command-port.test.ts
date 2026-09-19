import nodePath from "node:path";
import { describe, expect, it, vi } from "vitest";
import { NodeCommandProcessAbortedError } from "../../src/coding/host/command-process.js";
import { createNodeOriginDesktopCommandPort } from "../../src/coding/host/origin-desktop-command-port.js";
import { type CommandProcessPort, DesktopCommandAbortedError } from "../../src/coding/shared/desktop-command.js";

describe("Node Origin Desktop command port", () => {
	it("prefers the explicit environment executable without reading configuration", async () => {
		const readTextFile = vi.fn<() => Promise<string>>();
		const port = createNodeOriginDesktopCommandPort({
			environment: { ORIGIN_DESKTOP_EXE: "C:\\tools\\Origin.exe" },
			fileExists: async (filePath) => filePath === "C:\\tools\\Origin.exe",
			readTextFile,
		});

		await expect(port.locate()).resolves.toEqual({ path: "C:\\tools\\Origin.exe" });
		expect(readTextFile).not.toHaveBeenCalled();
	});

	it("uses a valid configured executable before platform defaults", async () => {
		const requestedFiles: string[] = [];
		const port = createNodeOriginDesktopCommandPort({
			platform: "linux",
			environment: {},
			originHomePath: "/home/test/.origin",
			fileExists: async (filePath) => filePath === "/opt/Origin/Origin",
			readTextFile: async (filePath) => {
				requestedFiles.push(filePath);
				return JSON.stringify({ originAppPath: "/opt/Origin/Origin", ignored: true });
			},
		});

		await expect(port.locate()).resolves.toEqual({ path: "/opt/Origin/Origin" });
		expect(requestedFiles).toEqual([nodePath.join("/home/test/.origin", "desktop-config.json")]);
	});

	it("reports a stale configured path when a default executable is available", async () => {
		const port = createNodeOriginDesktopCommandPort({
			platform: "darwin",
			environment: {},
			originHomePath: "/home/test/.origin",
			fileExists: async (filePath) => filePath === "/Applications/Origin.app/Contents/MacOS/Origin",
			readTextFile: async () => JSON.stringify({ originAppPath: "/old/Origin" }),
		});

		await expect(port.locate()).resolves.toEqual({
			path: "/Applications/Origin.app/Contents/MacOS/Origin",
			staleConfiguredPath: "/old/Origin",
		});
	});

	it("includes a stale configured path when no executable can be found", async () => {
		const port = createNodeOriginDesktopCommandPort({
			platform: "linux",
			environment: {},
			originHomePath: "/home/test/.origin",
			fileExists: async () => false,
			readTextFile: async () => JSON.stringify({ originAppPath: "/old/Origin" }),
		});

		await expect(port.locate()).rejects.toThrow("Configured originAppPath is stale: /old/Origin");
	});

	it("maps Node process cancellation to the platform-neutral command error", async () => {
		const commandProcess: CommandProcessPort = {
			async run() {
				throw new NodeCommandProcessAbortedError();
			},
		};
		const port = createNodeOriginDesktopCommandPort({ commandProcess });

		await expect(port.run("Origin", [], { timeoutMs: 1 })).rejects.toBeInstanceOf(DesktopCommandAbortedError);
	});
});
