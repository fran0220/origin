import { existsSync, mkdirSync, readFileSync, writeFileSync, writeSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@origin/coding-agent/config";
import {
	type ConnectionDescriptor,
	parseConnectionEndpoint,
	SIGNED_IN_CONNECTION_ID,
	stripEndpointToOrigin,
} from "@origin/coding-agent/connections";
import { z } from "zod";
import { connectionSecretRef, createCliCredentialVault } from "./cli-credential-host.js";

const HELP_TEXT = `Usage:
  origin connections list
  origin connections add --name <name> --endpoint <origin> [--protocol openai] [--secret-env VAR]
  origin connections remove <id>
  origin connections -h

Connection descriptors never include secrets. Keys are stored in the CLI vault.
`;

const helpSchema = z.object({ type: z.literal("help") });
const listSchema = z.object({ type: z.literal("list") });
const addSchema = z.object({
	type: z.literal("add"),
	name: z.string(),
	endpoint: z.string(),
	protocol: z.string(),
	secretEnv: z.string().optional(),
});
const removeSchema = z.object({ type: z.literal("remove"), id: z.string() });
const errorSchema = z.object({ type: z.literal("error"), exitCode: z.number(), message: z.string() });
const commandSchema = z.discriminatedUnion("type", [helpSchema, listSchema, addSchema, removeSchema, errorSchema]);

export type ConnectionsCommand = z.infer<typeof commandSchema>;

export function parseConnectionsCommand(argv: string[]): ConnectionsCommand | undefined {
	if (argv[0] !== "connections") return undefined;
	const rest = argv.slice(1);
	if (rest.length === 0 || rest[0] === "list" || rest[0] === "-h" || rest[0] === "--help") {
		return rest[0] === "list" || rest.length === 0 ? { type: "list" } : { type: "help" };
	}
	if (rest[0] === "add") {
		const name = flag(rest, "--name");
		const endpoint = flag(rest, "--endpoint");
		if (!name || !endpoint) {
			return { type: "error", exitCode: 2, message: "connections add requires --name and --endpoint." };
		}
		return {
			type: "add",
			name,
			endpoint,
			protocol: flag(rest, "--protocol") ?? "openai",
			...(flag(rest, "--secret-env") ? { secretEnv: flag(rest, "--secret-env") } : {}),
		};
	}
	if (rest[0] === "remove") {
		if (!rest[1]) return { type: "error", exitCode: 2, message: "connections remove requires an id." };
		return { type: "remove", id: rest[1] };
	}
	return { type: "error", exitCode: 2, message: `Unknown connections subcommand: ${rest[0]}` };
}

export async function runConnectionsCommand(command: ConnectionsCommand): Promise<number> {
	if (command.type === "help") {
		writeSync(1, HELP_TEXT);
		return 0;
	}
	if (command.type === "error") {
		writeSync(2, `${command.message}\n`);
		return command.exitCode;
	}
	const catalog = loadCatalog();
	if (command.type === "list") {
		writeSync(1, `${JSON.stringify(catalog, null, 2)}\n`);
		return 0;
	}
	if (command.type === "remove") {
		if (command.id === SIGNED_IN_CONNECTION_ID) {
			writeSync(2, "Use `origin auth logout` to leave a signed-in Connection.\n");
			return 2;
		}
		const vault = createCliCredentialVault();
		vault.remove(connectionSecretRef(command.id));
		saveCatalog(catalog.filter((item) => item.id !== command.id));
		writeSync(1, `Removed ${command.id}\n`);
		return 0;
	}

	const { origin } = stripEndpointToOrigin(command.endpoint);
	const descriptor: ConnectionDescriptor = {
		id: slug(command.name),
		displayName: command.name,
		protocol: command.protocol,
		endpoint: parseConnectionEndpoint(origin),
		credentialOrigin: command.secretEnv ? "env" : "provided",
	};
	if (command.secretEnv) {
		const secret = process.env[command.secretEnv];
		if (!secret) {
			writeSync(2, `${command.secretEnv} is empty.\n`);
			return 2;
		}
		createCliCredentialVault().put(connectionSecretRef(descriptor.id), secret, {
			kind: "connection-secret",
			consumer: descriptor.id,
		});
	}
	saveCatalog(catalog.filter((item) => item.id !== descriptor.id).concat(descriptor));
	writeSync(1, `${descriptor.id}\n`);
	return 0;
}

function catalogPath(): string {
	return join(getAgentDir(), "logged-out", "connections", "connections.json");
}

function loadCatalog(): ConnectionDescriptor[] {
	const path = catalogPath();
	if (!existsSync(path)) return [];
	try {
		const stored = JSON.parse(readFileSync(path, "utf8")) as { connections?: ConnectionDescriptor[] };
		return Array.isArray(stored.connections) ? stored.connections : [];
	} catch {
		return [];
	}
}

function saveCatalog(connections: ConnectionDescriptor[]): void {
	const path = catalogPath();
	mkdirSync(join(path, ".."), { recursive: true, mode: 0o700 });
	writeFileSync(path, `${JSON.stringify({ formatEpoch: 1, connections }, null, 2)}\n`, { mode: 0o600 });
}

function flag(args: readonly string[], name: string): string | undefined {
	const index = args.indexOf(name);
	if (index < 0) return undefined;
	return args[index + 1];
}

function slug(value: string): string {
	return (
		value
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "") || "connection"
	);
}
