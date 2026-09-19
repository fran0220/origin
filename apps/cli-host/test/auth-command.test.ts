import { describe, expect, it } from "vitest";
import { parseAuthCommand } from "../src/auth-command.js";
import { parseConnectionsCommand } from "../src/connections-command.js";

describe("CLI auth / connections commands", () => {
	it("parses auth login without printing a secret", () => {
		const command = parseAuthCommand(["auth", "login", "--server", "https://api.example.com"]);
		expect(command).toEqual({ type: "login", serverUrl: "https://api.example.com" });
	});

	it("rejects unknown auth subcommands", () => {
		expect(parseAuthCommand(["auth", "steal"])).toMatchObject({ type: "error", exitCode: 2 });
	});

	it("parses connections add from flags, never from a pasted argv secret", () => {
		expect(
			parseConnectionsCommand(["connections", "add", "--name", "openai", "--endpoint", "https://api.openai.com"]),
		).toEqual({
			type: "add",
			name: "openai",
			endpoint: "https://api.openai.com",
			protocol: "openai",
		});
	});
});
