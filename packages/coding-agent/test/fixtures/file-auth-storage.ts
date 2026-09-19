import { NodeTransactionalTextStorage, nodeConfigurationValueResolver } from "@origin/runtime-node/host";
import { AuthStorage, type AuthStorageDependencies } from "../../src/auth/index.js";

export function createFileAuthStorage(path: string, dependencies?: AuthStorageDependencies): AuthStorage {
	return AuthStorage.fromStorage(new NodeTransactionalTextStorage(path), {
		configurationValueResolver: nodeConfigurationValueResolver,
		...dependencies,
	});
}
