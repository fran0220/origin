import { SIGNED_IN_CONNECTION_ID } from "@vetta/coding-agent/connections";
import { getAccountDirectoryService } from "../../connections/account-directory.js";
import { getConnectionCatalog } from "../../connections/catalog.js";
import { refreshConnectionRelays } from "../../connections/relay-host.js";
import { DEFAULT_SERVER_URL } from "../../constants.js";
import { clearAccountTokens, readAccountRefreshToken } from "../../credentials/account-token-store.js";
import { getAppLogger } from "../../logger.js";
import { peekSharedRuntime } from "../../runtime.js";
import { syncCredentialFile } from "./credential-store.js";
import { discoverDesktopAuth, revokeRemoteSession } from "./pkce-login.js";

const log = getAppLogger("cloud-auth");

export interface SignOutResult {
	readonly revoked: boolean;
}

/**
 * Remote revoke first, then drop every local copy of the account session.
 * Local cleanup always runs: a network failure must not trap the user signed-in.
 */
export async function signOutAccount(): Promise<SignOutResult> {
	const refreshToken = readAccountRefreshToken();
	let revoked = false;
	if (refreshToken) {
		try {
			const discovery = await discoverDesktopAuth(DEFAULT_SERVER_URL);
			const logoutUrl = discovery.logoutUrl ?? `${DEFAULT_SERVER_URL.replace(/\/+$/, "")}/auth/logout`;
			const result = await revokeRemoteSession({ logoutUrl, refreshToken });
			revoked = result.ok;
			if (!result.ok) {
				log.warn(`remote revoke returned HTTP ${result.status}`);
			}
		} catch (error) {
			log.warn("remote revoke failed:", error);
		}
	}

	clearAccountTokens();
	syncCredentialFile(undefined);
	getConnectionCatalog().remove(SIGNED_IN_CONNECTION_ID);
	getAccountDirectoryService().selectLoggedOut();
	await refreshConnectionRelays();

	const runtime = peekSharedRuntime();
	if (runtime) {
		try {
			await runtime.reloadServerAuth(undefined);
		} catch (error) {
			log.warn("reloadServerAuth after sign-out failed:", error);
		}
	}

	return { revoked };
}
