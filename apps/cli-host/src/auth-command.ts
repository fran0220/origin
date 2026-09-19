import { writeSync } from "node:fs";
import { discoverDesktopAuth, revokeRemoteSession, startPkceLogin } from "@origin/coding-agent/connections";
import { z } from "zod";
import {
	ACCOUNT_ACCESS_TOKEN_REF,
	ACCOUNT_REFRESH_TOKEN_REF,
	createCliCredentialVault,
} from "./cli-credential-host.js";

const HELP_TEXT = `Usage:
  origin auth login [--server <url>]
  origin auth logout [--server <url>]
  origin auth -h

Sign in with Authorization Code + PKCE on a loopback redirect.
Secrets are stored in the CLI credential vault, never printed.
`;

const authHelpSchema = z.object({ type: z.literal("help") });
const authLoginSchema = z.object({
	type: z.literal("login"),
	serverUrl: z.string(),
});
const authLogoutSchema = z.object({
	type: z.literal("logout"),
	serverUrl: z.string(),
});
const authErrorSchema = z.object({
	type: z.literal("error"),
	exitCode: z.number(),
	message: z.string(),
});
const authCommandSchema = z.discriminatedUnion("type", [
	authHelpSchema,
	authLoginSchema,
	authLogoutSchema,
	authErrorSchema,
]);

export type AuthCommand = z.infer<typeof authCommandSchema>;

export function parseAuthCommand(argv: string[]): AuthCommand | undefined {
	if (argv[0] !== "auth") return undefined;
	const rest = argv.slice(1);
	if (rest.length === 0 || rest[0] === "-h" || rest[0] === "--help") {
		return { type: "help" };
	}
	const serverUrl = readServerUrl(rest) ?? process.env.ORIGIN_SERVER_URL ?? "";
	if (rest[0] === "login") {
		if (!serverUrl) return { type: "error", exitCode: 2, message: "ORIGIN_SERVER_URL or --server is required." };
		return { type: "login", serverUrl };
	}
	if (rest[0] === "logout") {
		if (!serverUrl) return { type: "error", exitCode: 2, message: "ORIGIN_SERVER_URL or --server is required." };
		return { type: "logout", serverUrl };
	}
	return { type: "error", exitCode: 2, message: `Unknown auth subcommand: ${rest[0]}` };
}

export async function runAuthCommand(command: AuthCommand): Promise<number> {
	if (command.type === "help") {
		writeSync(1, HELP_TEXT);
		return 0;
	}
	if (command.type === "error") {
		writeSync(2, `${command.message}\n`);
		return command.exitCode;
	}
	const vault = createCliCredentialVault();
	if (command.type === "logout") {
		const refresh = vault.get(ACCOUNT_REFRESH_TOKEN_REF);
		if (refresh) {
			const discovery = await discoverDesktopAuth(command.serverUrl);
			const logoutUrl = discovery.logoutUrl ?? `${command.serverUrl.replace(/\/+$/, "")}/auth/logout`;
			const result = await revokeRemoteSession({ logoutUrl, refreshToken: refresh });
			if (!result.ok) {
				writeSync(2, `Remote revoke returned HTTP ${result.status}. Local credentials were still cleared.\n`);
			}
		}
		vault.remove(ACCOUNT_ACCESS_TOKEN_REF);
		vault.remove(ACCOUNT_REFRESH_TOKEN_REF);
		writeSync(1, "Signed out.\n");
		return 0;
	}

	const discovery = await discoverDesktopAuth(command.serverUrl);
	if (discovery.mode !== "pkce" || !discovery.authorizeUrl || !discovery.tokenUrl) {
		writeSync(2, "This server does not advertise PKCE desktop auth. Set up /.well-known/vetta-desktop-auth.\n");
		return 2;
	}
	const login = await startPkceLogin({
		authorizeUrl: discovery.authorizeUrl,
		tokenUrl: discovery.tokenUrl,
		clientId: "cli",
		deviceName: `${process.platform}-cli`,
		openUrl: async (url) => {
			writeSync(1, `Open this URL to authorize:\n${url}\n`);
		},
	});
	writeSync(1, `Waiting for authorization at ${login.redirectUri}\n`);
	const tokens = await login.result;
	vault.put(ACCOUNT_ACCESS_TOKEN_REF, tokens.accessToken, { kind: "access-token", consumer: "cli" });
	if (tokens.refreshToken) {
		vault.put(ACCOUNT_REFRESH_TOKEN_REF, tokens.refreshToken, { kind: "refresh-token", consumer: "cli" });
	}
	writeSync(1, "Signed in. Credentials stored in the CLI vault.\n");
	return 0;
}

function readServerUrl(args: readonly string[]): string | undefined {
	const index = args.indexOf("--server");
	if (index < 0) return undefined;
	return args[index + 1];
}
