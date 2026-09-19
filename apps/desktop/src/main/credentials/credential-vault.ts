/**
 * Compatibility facade. New code should import `@vetta/runtime-node/credentials`
 * or `getDesktopCredentialVault()`. Existing Desktop modules keep this path.
 */
export {
	type CredentialCryptography,
	type CredentialEntry,
	type CredentialMetadata,
	type CredentialRef,
	CredentialVault,
} from "@vetta/runtime-node/credentials";
