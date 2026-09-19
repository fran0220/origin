/**
 * Compatibility facade. New code should import `@origin/runtime-node/credentials`
 * or `getDesktopCredentialVault()`. Existing Desktop modules keep this path.
 */
export {
	type CredentialCryptography,
	type CredentialEntry,
	type CredentialMetadata,
	type CredentialRef,
	CredentialVault,
} from "@origin/runtime-node/credentials";
